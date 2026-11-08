import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { api, ApiError } from '../api'
import { CategoriasPage } from './categorias'

// Mockar `api` (não a rede) — mesmo padrão de recorrentes.test.tsx/
// config.test.tsx: `api` já traduz envelope/erro, testar aqui prova o
// COMPONENTE, não o transporte HTTP.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

// Relógio FIXO no arquivo inteiro — este app já teve testes vermelhos por
// deriva de calendário. `shouldAdvanceTime` é o que mantém `waitFor`/
// `userEvent` funcionando (os dois dependem de setTimeout por baixo).
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-16T12:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

function cat(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c-x',
    parent_id: null,
    name: 'X',
    kind: 'expense',
    slug: null,
    default_scope: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

// A hierarquia REAL semeada pela migration: "Custos da PJ" é mãe de
// DAS/Contador/INSS (0001:486-497) — sempre existiu no banco e nenhuma tela
// jamais a renderizou.
const categorias = [
  cat({
    id: 'c-das',
    name: 'DAS — Simples Nacional',
    parent_id: 'c-pj',
    slug: 'das',
  }),
  cat({ id: 'c-pj', name: 'Custos da PJ', default_scope: 'PJ' }),
  cat({
    id: 'c-contador',
    name: 'Contador',
    parent_id: 'c-pj',
    slug: 'contador',
  }),
  cat({
    id: 'c-quitacao',
    name: 'Quitacao de divida',
    kind: 'debt_settlement',
    slug: 'quitacao-divida',
  }),
]

function mockApi(
  opts: {
    lista?: () => unknown
    post?: () => unknown
    put?: () => unknown
    archive?: () => unknown
    budgets?: () => unknown
    budgetPut?: () => unknown
    budgetDelete?: () => unknown
  } = {},
) {
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && path === '/api/categories') {
        return opts.lista ? opts.lista() : categorias
      }
      if (method === 'GET' && path.startsWith('/api/budgets')) {
        if (opts.budgets) return opts.budgets()
        throw new Error('orçamento indisponível')
      }
      if (method === 'PUT' && path.startsWith('/api/budgets/')) {
        return opts.budgetPut ? opts.budgetPut() : { ok: true }
      }
      if (method === 'DELETE' && path.startsWith('/api/budgets/')) {
        return opts.budgetDelete ? opts.budgetDelete() : { ok: true }
      }
      if (method === 'POST' && path === '/api/categories') {
        return opts.post ? opts.post() : cat({ id: 'c-nova', name: 'Mercado' })
      }
      if (method === 'PUT' && path.startsWith('/api/categories/')) {
        return opts.put ? opts.put() : cat({ id: path.split('/').pop() })
      }
      if (method === 'POST' && path.endsWith('/archive')) {
        return opts.archive
          ? opts.archive()
          : { id: path.split('/')[3], archived: true }
      }
      throw new Error(`chamada inesperada: ${method} ${path}`)
    },
  )
}

function corpoDaChamada(metodo: string, path: string): Record<string, unknown> {
  const chamada = vi
    .mocked(api)
    .mock.calls.find(
      ([p, init]) => p === path && (init as RequestInit)?.method === metodo,
    )
  if (!chamada) throw new Error(`nenhuma chamada ${metodo} ${path} encontrada`)
  return JSON.parse((chamada[1] as RequestInit).body as string)
}

async function esperarLista() {
  await waitFor(() =>
    expect(screen.getByTestId('categoria-c-pj')).toBeInTheDocument(),
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('CategoriasPage', () => {
  // ⚠️ O teste central da tela: a hierarquia existe no banco desde o 0001 e
  // NENHUMA tela a renderizava. Mãe primeiro, filhas logo abaixo, indentadas
  // — não é ordem alfabética global (Contador/Custos da PJ/DAS lado a lado).
  it('renderiza a hierarquia: filhas indentadas logo abaixo da mãe', async () => {
    mockApi()

    render(<CategoriasPage />)
    await esperarLista()

    const itens = within(screen.getByTestId('lista-categorias')).getAllByRole(
      'listitem',
    )
    expect(itens.map((li) => li.getAttribute('data-testid'))).toEqual([
      'categoria-c-pj',
      'categoria-c-contador',
      'categoria-c-das',
      'categoria-c-quitacao',
    ])

    expect(screen.getByTestId('categoria-c-pj')).toHaveAttribute(
      'data-nivel',
      '0',
    )
    expect(screen.getByTestId('categoria-c-das')).toHaveAttribute(
      'data-nivel',
      '1',
    )
    expect(screen.getByTestId('categoria-c-quitacao')).toHaveAttribute(
      'data-nivel',
      '0',
    )
    // O tipo aparece por extenso, incl. o escopo padrão quando existe.
    expect(screen.getByTestId('tipo-c-pj')).toHaveTextContent('Despesa · PJ')
    expect(screen.getByTestId('tipo-c-quitacao')).toHaveTextContent(
      'Quitação de dívida',
    )
  })

  it('cria categoria raiz — POST com kind e sem parent_id', async () => {
    mockApi()

    render(<CategoriasPage />)
    await esperarLista()

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Mercado' },
    })
    fireEvent.submit(screen.getByTestId('form-categoria'))

    await waitFor(() => {
      expect(corpoDaChamada('POST', '/api/categories')).toEqual({
        name: 'Mercado',
        parent_id: null,
        default_scope: null,
        kind: 'expense',
      })
    })
  })

  it('cria FILHA: escolher a mãe manda parent_id', async () => {
    mockApi()

    render(<CategoriasPage />)
    await esperarLista()

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'INSS' },
    })
    fireEvent.change(screen.getByLabelText('Categoria mãe'), {
      target: { value: 'c-pj' },
    })
    fireEvent.change(screen.getByLabelText('Escopo padrão'), {
      target: { value: 'PJ' },
    })
    fireEvent.submit(screen.getByTestId('form-categoria'))

    await waitFor(() => {
      const body = corpoDaChamada('POST', '/api/categories')
      expect(body.parent_id).toBe('c-pj')
      expect(body.default_scope).toBe('PJ')
    })
  })

  // Só RAIZ pode ser mãe (a árvore tem 2 níveis) — oferecer uma filha como
  // mãe seria oferecer uma opção que o servidor sempre recusaria.
  it('o select de mãe lista só raízes, e nunca a própria categoria em edição', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<CategoriasPage />)
    await esperarLista()

    const opcoes = () =>
      Array.from(
        (screen.getByLabelText('Categoria mãe') as HTMLSelectElement).options,
      ).map((o) => o.value)

    expect(opcoes()).toEqual(['', 'c-pj', 'c-quitacao'])

    // Editando uma FILHA: ela mesma some da lista de mães possíveis.
    await user.click(
      within(screen.getByTestId('categoria-c-das')).getByRole('button', {
        name: 'Editar',
      }),
    )
    expect(opcoes()).toEqual(['', 'c-pj', 'c-quitacao'])
    expect(screen.getByLabelText('Nome')).toHaveValue('DAS — Simples Nacional')
    // `kind` não é editável — vira texto, não um <select> que o PUT recusaria.
    expect(screen.getByTestId('tipo-fixo')).toHaveTextContent('Despesa')
  })

  it('editar manda PUT SEM kind no corpo (o servidor recusaria o corpo inteiro)', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<CategoriasPage />)
    await esperarLista()

    await user.click(
      within(screen.getByTestId('categoria-c-das')).getByRole('button', {
        name: 'Editar',
      }),
    )
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'DAS' },
    })
    fireEvent.submit(screen.getByTestId('form-categoria'))

    await waitFor(() => {
      const body = corpoDaChamada('PUT', '/api/categories/c-das')
      expect(body).toEqual({
        name: 'DAS',
        parent_id: 'c-pj',
        default_scope: null,
      })
      expect('kind' in body).toBe(false)
    })
  })

  // Quem JÁ é mãe não pode virar filha (viraria 3º nível) — a tela troca o
  // campo por um aviso em vez de oferecer a opção e colher o 422.
  it('editando uma MÃE, o campo "categoria mãe" some e explica por quê', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<CategoriasPage />)
    await esperarLista()

    await user.click(
      within(screen.getByTestId('categoria-c-pj')).getByRole('button', {
        name: 'Editar',
      }),
    )

    expect(screen.queryByLabelText('Categoria mãe')).not.toBeInTheDocument()
    expect(screen.getByTestId('mae-fixa')).toHaveTextContent(/2 níveis/)
  })

  describe('arquivar', () => {
    it('pede confirmação; cancelar NÃO chama a API', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<CategoriasPage />)
      await esperarLista()
      vi.mocked(api).mockClear()

      await user.click(
        within(screen.getByTestId('categoria-c-das')).getByRole('button', {
          name: 'Arquivar',
        }),
      )

      // Confirmar que o diálogo ABRIU antes de cancelar: um botão inerte
      // (window.confirm desabilitado no Chrome Android) falharia já aqui.
      expect(
        await screen.findByRole('heading', { name: 'Arquivar categoria' }),
      ).toBeInTheDocument()
      const dialogo = screen.getByRole('dialog')
      expect(dialogo).toHaveTextContent('DAS — Simples Nacional')
      expect(dialogo).toHaveTextContent(/NADA é apagado/i)
      expect(dialogo).toHaveTextContent(/não há como desarquivar/i)

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(
        screen.queryByRole('heading', { name: 'Arquivar categoria' }),
      ).not.toBeInTheDocument()
      expect(api).not.toHaveBeenCalled()
    })

    it('confirmar chama POST /:id/archive e recarrega a lista sem ela', async () => {
      mockApi({
        lista: vi
          .fn()
          .mockResolvedValueOnce(categorias)
          .mockResolvedValueOnce(categorias.filter((c) => c.id !== 'c-das')),
      })
      const user = userEvent.setup()

      render(<CategoriasPage />)
      await esperarLista()

      await user.click(
        within(screen.getByTestId('categoria-c-das')).getByRole('button', {
          name: 'Arquivar',
        }),
      )
      await screen.findByRole('heading', { name: 'Arquivar categoria' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(api).toHaveBeenCalledWith('/api/categories/c-das/archive', {
          method: 'POST',
        }),
      )
      await waitFor(() =>
        expect(screen.queryByTestId('categoria-c-das')).not.toBeInTheDocument(),
      )
    })

    // Mãe com filha ATIVA é 422 no servidor (arquivar só a mãe deixaria as
    // filhas visíveis penduradas numa mãe invisível) — a mensagem vem CRUA
    // do domínio, é ela que diz o que fazer.
    it('arquivar mãe com filha ativa: mostra a recusa do servidor, tela de pé', async () => {
      mockApi({
        archive: () => {
          throw new ApiError(
            422,
            'constraint_violation',
            'esta categoria é mãe de categorias ativas — arquive as filhas primeiro, senão elas ficariam visíveis penduradas numa mãe invisível',
          )
        },
      })
      const user = userEvent.setup()

      render(<CategoriasPage />)
      await esperarLista()

      await user.click(
        within(screen.getByTestId('categoria-c-pj')).getByRole('button', {
          name: 'Arquivar',
        }),
      )
      await screen.findByRole('heading', { name: 'Arquivar categoria' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent(/arquive as filhas primeiro/i)
      // A tela continua de pé: mãe e filhas ainda listadas.
      expect(screen.getByTestId('categoria-c-pj')).toBeInTheDocument()
      expect(screen.getByTestId('categoria-c-das')).toBeInTheDocument()
    })
  })

  // POST 201 + GET seguinte caindo: ler "falhou" depois de uma criação que
  // ACONTECEU faz o dono criar "Mercado" de novo, e o relatório por
  // categoria passa a mostrar o mesmo gasto partido em duas linhas.
  it('categoria criada mas recarga falhou: diz que criou, nunca que falhou', async () => {
    let gets = 0
    mockApi({
      lista: () => {
        gets++
        if (gets >= 2) {
          throw new ApiError(503, 'sem_conexao', 'sem conexão com o servidor')
        }
        return categorias
      },
    })

    render(<CategoriasPage />)
    await esperarLista()

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Mercado' },
    })
    fireEvent.submit(screen.getByTestId('form-categoria'))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/A categoria "Mercado" foi criada/i)
    expect(alerta).toHaveTextContent(/não envie de novo/i)
    expect(alerta.textContent ?? '').not.toMatch(/falh/i)
    expect(alerta.textContent ?? '').not.toMatch(/sem conexão/)
  })

  it('nome vazio: erro no cliente, NÃO chama a API', async () => {
    mockApi()

    render(<CategoriasPage />)
    await esperarLista()
    vi.mocked(api).mockClear()

    fireEvent.submit(screen.getByTestId('form-categoria'))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Dê um nome para a categoria.',
    )
    expect(api).not.toHaveBeenCalled()
  })

  it('erro ao carregar mostra role="alert"', async () => {
    mockApi({
      lista: () => {
        throw new ApiError(
          503,
          'auth_unavailable',
          'sem conexão com o servidor',
        )
      },
    })

    render(<CategoriasPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'sem conexão com o servidor',
      ),
    )
  })
})

describe('CategoriasPage — status como badge e alvo de toque', () => {
  it('o tipo da categoria é um chip, não texto solto', async () => {
    // `regras.tsx` é a referência (`<Badge>Pausada</Badge>`) e outras 5 telas
    // já usavam badge; esta e o extrato eram as duas que ficaram para trás.
    mockApi()
    render(<CategoriasPage />)
    const chip = await screen.findByTestId('tipo-c-pj')
    expect(chip.className).toMatch(/rounded-full|border/)
    // o texto não muda — o contrato da tela continua o mesmo
    expect(chip).toHaveTextContent('Despesa · PJ')
  })

  it('Editar/Arquivar são alvos de 44px, com o destrutivo na outra ponta', async () => {
    mockApi()
    render(<CategoriasPage />)
    await screen.findByTestId('categoria-c-pj')

    const linha = within(screen.getByTestId('categoria-c-pj'))
    const editar = linha.getByRole('button', { name: 'Editar' })
    const arquivar = linha.getByRole('button', { name: 'Arquivar' })
    expect(editar.className).toContain('min-h-11')
    expect(arquivar.className).toContain('min-h-11')
    expect(arquivar.className).toContain('ml-auto')
    expect(editar.className).not.toContain('ml-auto')
  })
})

// ② Agrupamento visual por tipo — SEM perder a hierarquia, que é a prova
// que a tela existe pra dar.
describe('CategoriasPage — grupos por tipo', () => {
  it('agrupa por tipo com cabeçalho em versalete e contagem', async () => {
    mockApi()
    render(<CategoriasPage />)
    await esperarLista()

    const despesa = screen.getByTestId('grupo-expense')
    const quitacao = screen.getByTestId('grupo-debt_settlement')

    // A família de "Custos da PJ" (mãe + 2 filhas) toda no grupo de despesa.
    expect(within(despesa).getByTestId('categoria-c-pj')).toBeInTheDocument()
    expect(
      within(despesa).getByTestId('categoria-c-contador'),
    ).toBeInTheDocument()
    expect(within(despesa).getByTestId('categoria-c-das')).toBeInTheDocument()
    expect(
      within(quitacao).getByTestId('categoria-c-quitacao'),
    ).toBeInTheDocument()

    // `:scope > p` e não `getByText(/^Despesa/)`: o badge de cada linha lê
    // "Despesa · PJ" e casaria junto.
    const cabecalho = despesa.querySelector(':scope > p') as HTMLElement
    expect(cabecalho).toHaveTextContent('Despesa · 3')
    expect(cabecalho.className).toContain('font-mono')
    expect(cabecalho.className).toContain('uppercase')

    // Despesa antes das classes estruturais.
    expect(despesa.compareDocumentPosition(quitacao)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('grupo de tipo sem nenhuma categoria não renderiza', async () => {
    mockApi()
    render(<CategoriasPage />)
    await esperarLista()

    // A fixture não tem nenhuma `income`/`transfer`.
    expect(screen.queryByTestId('grupo-income')).not.toBeInTheDocument()
    expect(screen.queryByTestId('grupo-transfer')).not.toBeInTheDocument()
  })

  // ⚠️ O teste que trava a decisão do agrupamento: a chave é o `kind` da
  // RAIZ, nunca o da própria linha. Nada no schema obriga a filha a ter o
  // mesmo `kind` da mãe — agrupando por linha, esta filha cairia num grupo
  // OUTRO carregando `nivel: 1`, ou seja, renderizaria indentada e pendurada
  // em nada, exatamente o modo de falha que `ordenarPorHierarquia` evita.
  it('filha de kind DIFERENTE da mãe fica no grupo da mãe, ainda indentada', async () => {
    mockApi({
      lista: () => [
        cat({ id: 'c-pj', name: 'Custos da PJ' }), // expense
        cat({
          id: 'c-estorno',
          name: 'Estorno',
          parent_id: 'c-pj',
          kind: 'income',
        }),
      ],
    })
    render(<CategoriasPage />)
    await esperarLista()

    const despesa = screen.getByTestId('grupo-expense')
    // A filha `income` viaja com a mãe `expense`.
    expect(
      within(despesa).getByTestId('categoria-c-estorno'),
    ).toBeInTheDocument()
    // E NÃO existe um grupo de entrada só pra ela.
    expect(screen.queryByTestId('grupo-income')).not.toBeInTheDocument()

    // A indentação — a prova da hierarquia — continua intacta.
    const filha = screen.getByTestId('categoria-c-estorno')
    expect(filha).toHaveAttribute('data-nivel', '1')
    expect(filha.className).toContain('ml-4')
    expect(filha.className).toContain('border-l')
  })

  it('a indentação da filha sobrevive ao agrupamento', async () => {
    mockApi()
    render(<CategoriasPage />)
    await esperarLista()

    // Mãe sem indentação, filhas com — o que prova que "Custos da PJ" é mãe
    // de DAS/Contador (migration 0001), renderizado pela primeira vez.
    expect(screen.getByTestId('categoria-c-pj').className).not.toContain('ml-4')
    for (const id of ['categoria-c-das', 'categoria-c-contador']) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-nivel', '1')
      expect(screen.getByTestId(id).className).toContain('ml-4')
    }
  })
})

// ---------------------------------------------------------------------
// Orçamento na tela de Categorias (UI aprovada): coluna de limite por
// despesa e o campo "Limite mensal" no formulário.
// ---------------------------------------------------------------------
const linhaOrc = (id: string, orcado: number | null, gasto: number) => ({
  category_id: id,
  category_name: id,
  parent_name: null,
  budget_cents: orcado,
  spent_cents: gasto,
  budgetable: true,
  average_3m_cents: 0,
})

const orcamento = (rows: ReturnType<typeof linhaOrc>[]) => ({
  month: '2026-08',
  rows,
  total_budget_cents: 0,
  budgeted_spent_cents: 0,
  uncategorized_spent_cents: 0,
})

const comLimites = () =>
  orcamento([
    linhaOrc('c-pj', 210000, 198000),
    linhaOrc('c-contador', 60000, 70000),
    linhaOrc('c-das', null, 1200),
  ])

describe('CategoriasPage — orçamento', () => {
  it('despesa com limite mostra a barra e o valor, com link para o Orçamento', async () => {
    mockApi({ budgets: comLimites })
    render(<CategoriasPage />)
    const link = await screen.findByRole('link', {
      name: 'Orçamento de Custos da PJ: R$ 2.100,00',
    })
    expect(link).toHaveAttribute('href', '#/orcamento')
    const barra = within(link).getByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuenow', '94')
    // estourada: a barra enche e o valor segue legível
    const estourada = screen.getByRole('link', {
      name: 'Orçamento de Contador: R$ 600,00',
    })
    expect(within(estourada).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100',
    )
  })

  it('despesa sem limite oferece "Definir limite"; entrada e estrutural não têm coluna', async () => {
    mockApi({ budgets: comLimites })
    render(<CategoriasPage />)
    const definir = await screen.findByRole('link', {
      name: 'Definir limite de DAS — Simples Nacional',
    })
    expect(definir).toHaveAttribute('href', '#/orcamento')
    const quitacao = screen.getByTestId('categoria-c-quitacao')
    expect(within(quitacao).queryByRole('link')).not.toBeInTheDocument()
  })

  it('o cabeçalho do grupo diz de onde vem o orçamento e o que é estrutural', async () => {
    mockApi({ budgets: comLimites })
    render(<CategoriasPage />)
    await screen.findByRole('link', { name: /Orçamento de Custos da PJ/ })
    expect(
      within(screen.getByTestId('grupo-expense')).getByText(
        'orçamento · ago/26',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('grupo-debt_settlement')).getByText(
        'estrutural · sem orçamento',
      ),
    ).toBeInTheDocument()
  })

  it('orçamento fora do ar: a lista continua inteira, sem coluna e sem alerta', async () => {
    mockApi()
    render(<CategoriasPage />)
    await screen.findByTestId('categoria-c-pj')
    expect(
      screen.queryByRole('link', { name: /limite/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('CategoriasPage — Limite mensal no formulário', () => {
  it('despesa mostra o campo com a dica do mês; entrada não mostra', async () => {
    mockApi({ budgets: comLimites })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CategoriasPage />)
    await screen.findByTestId('categoria-c-pj')
    expect(
      screen.getByLabelText('Limite mensal (opcional)'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Vale a partir de agosto. Dá para mudar mês a mês em Orçamento.',
      ),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Tipo'), 'income')
    expect(
      screen.queryByLabelText('Limite mensal (opcional)'),
    ).not.toBeInTheDocument()
  })

  it('cria a categoria e, em seguida, o limite do mês corrente', async () => {
    mockApi({ budgets: comLimites })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CategoriasPage />)
    await screen.findByTestId('categoria-c-pj')
    await user.type(screen.getByLabelText('Nome'), 'Farmácia')
    await user.type(screen.getByLabelText('Limite mensal (opcional)'), '250,00')
    await user.click(screen.getByRole('button', { name: 'Criar categoria' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/c-nova', {
        method: 'PUT',
        body: JSON.stringify({ amount_cents: 25000 }),
      }),
    )
  })

  it('sem limite digitado, nenhuma chamada de orçamento é feita', async () => {
    mockApi({ budgets: comLimites })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CategoriasPage />)
    await screen.findByTestId('categoria-c-pj')
    await user.type(screen.getByLabelText('Nome'), 'Farmácia')
    await user.click(screen.getByRole('button', { name: 'Criar categoria' }))
    await waitFor(() =>
      expect(corpoDaChamada('POST', '/api/categories')).toBeDefined(),
    )
    expect(
      vi
        .mocked(api)
        .mock.calls.filter(
          ([p, i]) => String(p).startsWith('/api/budgets/') && i?.method,
        ),
    ).toHaveLength(0)
  })

  it.each([['abc'], ['0']])(
    'limite %j é recusado antes de criar a categoria',
    async (digitado) => {
      mockApi({ budgets: comLimites })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CategoriasPage />)
      await screen.findByTestId('categoria-c-pj')
      await user.type(screen.getByLabelText('Nome'), 'Farmácia')
      await user.type(
        screen.getByLabelText('Limite mensal (opcional)'),
        digitado,
      )
      await user.click(screen.getByRole('button', { name: 'Criar categoria' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/limite/i)
      expect(
        vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'POST'),
      ).toHaveLength(0)
    },
  )

  it('se o limite falhar depois de criar, avisa que a categoria existe e não manda criar de novo', async () => {
    mockApi({
      budgets: comLimites,
      budgetPut: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'categoria arquivada não aceita orçamento',
        )
      },
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CategoriasPage />)
    await screen.findByTestId('categoria-c-pj')
    await user.type(screen.getByLabelText('Nome'), 'Farmácia')
    await user.type(screen.getByLabelText('Limite mensal (opcional)'), '100')
    await user.click(screen.getByRole('button', { name: 'Criar categoria' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('A categoria "Farmácia" foi criada')
    expect(alerta).toHaveTextContent('o limite não foi salvo')
    expect(alerta).toHaveTextContent('categoria arquivada não aceita orçamento')
    expect(
      vi
        .mocked(api)
        .mock.calls.filter(
          ([p, i]) => p === '/api/categories' && i?.method === 'POST',
        ),
    ).toHaveLength(1)
  })

  it('POST ok, limite falha E a recarga cai: os dois avisos aparecem, o formulário fica limpo e não repete o POST', async () => {
    let leituras = 0
    mockApi({
      budgets: comLimites,
      lista: () => {
        // a primeira leitura (abertura da tela) funciona; a recarga pós-POST cai
        if (++leituras > 1) throw new ApiError(0, 'rede', 'sem conexão')
        return categorias
      },
      budgetPut: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'categoria arquivada não aceita orçamento',
        )
      },
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CategoriasPage />)
    await screen.findByTestId('categoria-c-pj')
    await user.type(screen.getByLabelText('Nome'), 'Farmácia')
    await user.type(screen.getByLabelText('Limite mensal (opcional)'), '100')
    await user.click(screen.getByRole('button', { name: 'Criar categoria' }))

    const alerta = await screen.findByRole('alert')
    // a recarga que caiu
    expect(alerta).toHaveTextContent('A categoria "Farmácia" foi criada')
    expect(alerta).toHaveTextContent('não consegui recarregar a lista')
    expect(alerta).toHaveTextContent('Não envie de novo')
    // E o limite que NÃO foi salvo, com a causa
    expect(alerta).toHaveTextContent('o limite mensal não foi salvo')
    expect(alerta).toHaveTextContent('categoria arquivada não aceita orçamento')
    expect(alerta).toHaveTextContent('Defina em Orçamento')
    // formulário limpo e nenhum segundo POST
    expect(screen.getByLabelText('Nome')).toHaveValue('')
    expect(screen.getByLabelText('Limite mensal (opcional)')).toHaveValue('')
    expect(
      vi
        .mocked(api)
        .mock.calls.filter(
          ([p, i]) => p === '/api/categories' && i?.method === 'POST',
        ),
    ).toHaveLength(1)
  })

  it('editar traz o limite atual; mudar salva, esvaziar remove e manter não chama nada', async () => {
    mockApi({ budgets: comLimites })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CategoriasPage />)
    const li = await screen.findByTestId('categoria-c-contador')
    await user.click(within(li).getByRole('button', { name: 'Editar' }))
    const campo = screen.getByLabelText('Limite mensal (opcional)')
    expect(campo).toHaveValue('R$ 600,00')

    // manter: nenhuma chamada de orçamento
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() =>
      expect(corpoDaChamada('PUT', '/api/categories/c-contador')).toBeDefined(),
    )
    expect(
      vi
        .mocked(api)
        .mock.calls.filter(
          ([p, i]) => String(p).startsWith('/api/budgets/') && i?.method,
        ),
    ).toHaveLength(0)

    // mudar
    await user.click(
      within(await screen.findByTestId('categoria-c-contador')).getByRole(
        'button',
        { name: 'Editar' },
      ),
    )
    const campo2 = screen.getByLabelText('Limite mensal (opcional)')
    await user.clear(campo2)
    await user.type(campo2, '700,00')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/c-contador', {
        method: 'PUT',
        body: JSON.stringify({ amount_cents: 70000 }),
      }),
    )

    // esvaziar
    await user.click(
      within(await screen.findByTestId('categoria-c-contador')).getByRole(
        'button',
        { name: 'Editar' },
      ),
    )
    await user.clear(screen.getByLabelText('Limite mensal (opcional)'))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/c-contador', {
        method: 'DELETE',
      }),
    )
  })

  it('editar uma entrada não mostra o campo de limite', async () => {
    mockApi({
      budgets: comLimites,
      lista: () => [
        ...categorias,
        cat({ id: 'c-salario', name: 'Salário', kind: 'income' }),
      ],
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CategoriasPage />)
    const li = await screen.findByTestId('categoria-c-salario')
    await user.click(within(li).getByRole('button', { name: 'Editar' }))
    expect(
      screen.queryByLabelText('Limite mensal (opcional)'),
    ).not.toBeInTheDocument()
  })
})

import * as historiasCategorias from './categorias.stories'
import { ColunaDeOrcamento } from './categorias'

describe('categorias.stories — a coluna de orçamento', () => {
  const { default: _meta, ...historias } = historiasCategorias
  it('cada story mostra o estado que o nome promete', () => {
    const esperado: Record<string, (c: HTMLElement) => void> = {
      SemLimite: (c) =>
        expect(
          within(c).getByRole('link', { name: 'Definir limite de Mercado' }),
        ).toBeInTheDocument(),
      DentroDoLimite: (c) => {
        expect(within(c).getByRole('progressbar')).toHaveAttribute(
          'aria-valuenow',
          '25',
        )
        expect(within(c).getByText('R$ 1.200,00')).toBeInTheDocument()
      },
      EmAtencao: (c) =>
        expect(within(c).getByRole('progressbar')).toHaveAttribute(
          'aria-valuenow',
          '83',
        ),
      Estourada: (c) =>
        expect(within(c).getByRole('progressbar')).toHaveAttribute(
          'aria-valuenow',
          '100',
        ),
    }
    expect(Object.keys(historias).sort()).toEqual(Object.keys(esperado).sort())
    for (const [nome, h] of Object.entries(historias)) {
      const { container, unmount } = render(<ColunaDeOrcamento {...h.args} />)
      esperado[nome](container)
      unmount()
    }
  })
})
