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
  } = {},
) {
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && path === '/api/categories') {
        return opts.lista ? opts.lista() : categorias
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
