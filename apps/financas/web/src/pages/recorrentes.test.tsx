import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { RecorrentesPage } from './recorrentes'

// Mockar `api` (não a rede) — mesmo padrão de config.test.tsx/
// debt-detail.test.tsx: `api` já traduz envelope/erro, testar aqui prova o
// COMPONENTE, não o transporte HTTP.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const recorrentes = [
  {
    id: 'r-starlink',
    description: 'Starlink',
    category_id: null,
    account_id: null,
    scope: 'PJ',
    day_of_month: 10,
    amount_min_cents: 18900,
    amount_max_cents: 18900,
    starts_on: '2026-01-01',
    ends_on: null,
    active: 1,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'r-das',
    description: 'DAS',
    category_id: 'c-das',
    account_id: 'a1',
    scope: 'PJ',
    day_of_month: 20,
    amount_min_cents: 1200,
    amount_max_cents: 60000,
    starts_on: '2026-01-01',
    ends_on: null,
    active: 0,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

const categorias = [{ id: 'c-das', name: 'DAS — Simples Nacional' }]

const contas = [
  {
    id: 'a1',
    name: 'Nubank PJ',
    scope: 'PJ',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 100000,
  },
]

/**
 * Roteia `api()` mockado por (método, path) — mesmo padrão de
 * `debt-detail.test.tsx#mockApi`.
 */
function mockApi(
  opts: {
    recurring?: () => unknown
    categorias?: () => unknown
    contas?: () => unknown
    post?: () => unknown
    put?: () => unknown
    del?: () => unknown
  } = {},
) {
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && path === '/api/recurring') {
        return opts.recurring ? opts.recurring() : recorrentes
      }
      if (method === 'GET' && path === '/api/categories?kind=expense') {
        return opts.categorias ? opts.categorias() : categorias
      }
      if (method === 'GET' && path === '/api/accounts') {
        return opts.contas ? opts.contas() : contas
      }
      if (method === 'POST' && path === '/api/recurring') {
        return opts.post ? opts.post() : { id: 'novo' }
      }
      if (method === 'PUT' && path.startsWith('/api/recurring/')) {
        return opts.put ? opts.put() : { id: path.split('/').pop() }
      }
      if (method === 'DELETE' && path.startsWith('/api/recurring/')) {
        return opts.del
          ? opts.del()
          : { id: path.split('/').pop(), deleted: true }
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

afterEach(() => {
  vi.clearAllMocks()
})

describe('RecorrentesPage', () => {
  it('mostra o heading e lista as recorrentes — ativas E pausadas, faixa formatada corretamente', async () => {
    mockApi()

    render(<RecorrentesPage />)

    // Mesmo padrão de accounts.tsx/commitments.tsx/debt-detail.tsx: o <h1>
    // fica atrás do gate `if (!recorrentes) return <p>Carregando…</p>` —
    // só aparece depois que a lista chega.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Recorrentes' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument()

    // Starlink: min === max (fixo) — UM número só, nunca repetido.
    expect(screen.getByTestId('faixa-r-starlink')).toHaveTextContent(
      'R$ 189,00',
    )
    expect(screen.getByTestId('faixa-r-starlink')).not.toHaveTextContent(
      'R$ 189,00 a R$ 189,00',
    )
    // DAS: faixa de verdade — intervalo.
    expect(screen.getByTestId('faixa-r-das')).toHaveTextContent(
      'R$ 12,00 a R$ 600,00',
    )

    // GET /api/recurring devolve ativas E pausadas (includeInactive: true,
    // decisão do backend) — a tela precisa mostrar as duas, distinguindo.
    expect(screen.queryByTestId('status-r-starlink')).not.toBeInTheDocument()
    expect(screen.getByTestId('status-r-das')).toHaveTextContent('Pausada')
    // ⑤ "Pausada" era texto solto com markup próprio; virou badge do design
    // system (`@piluvitu/ui/badge`, que tinha zero imports). `inline-flex` é
    // a base do `badgeVariants` — some se voltar a ser um `<span>` cru.
    expect(screen.getByTestId('status-r-das')).toHaveClass('inline-flex')
  })

  it('um só campo de valor por padrão — "Valor máximo" só aparece depois de marcar "varia?"', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
    )

    expect(screen.getByLabelText('Valor')).toBeInTheDocument()
    expect(screen.queryByLabelText('Valor máximo')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Varia?' }))

    expect(screen.getByLabelText('Valor mínimo')).toBeInTheDocument()
    expect(screen.getByLabelText('Valor máximo')).toBeInTheDocument()
  })

  it('ajuda "Faixa" explica por que faixa e não média, abre no clique', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
    )

    expect(screen.queryByText(/nunca acontece/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ajuda sobre Faixa' }))

    expect(await screen.findByText(/nunca acontece/i)).toBeInTheDocument()
  })

  it('cria recorrente FIXA (sem marcar "varia?"): amount_max_cents === amount_min_cents', async () => {
    mockApi()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Starlink' },
    })
    fireEvent.change(screen.getByLabelText('Dia do mês'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '189,00' },
    })
    fireEvent.change(screen.getByLabelText('Começa em'), {
      target: { value: '2026-01-01' },
    })
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    await waitFor(() => {
      const body = corpoDaChamada('POST', '/api/recurring')
      expect(body).toEqual({
        description: 'Starlink',
        category_id: null,
        account_id: null,
        scope: 'PJ',
        day_of_month: 10,
        amount_min_cents: 18900,
        amount_max_cents: 18900,
        starts_on: '2026-01-01',
        ends_on: null,
        active: 1,
        notes: null,
      })
    })
  })

  it('cria recorrente EM FAIXA (varia marcado): amount_min_cents !== amount_max_cents', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'DAS' },
    })
    fireEvent.change(screen.getByLabelText('Dia do mês'), {
      target: { value: '20' },
    })
    await user.click(screen.getByRole('checkbox', { name: 'Varia?' }))
    fireEvent.change(screen.getByLabelText('Valor mínimo'), {
      target: { value: '12,00' },
    })
    fireEvent.change(screen.getByLabelText('Valor máximo'), {
      target: { value: '600,00' },
    })
    fireEvent.change(screen.getByLabelText('Começa em'), {
      target: { value: '2026-01-01' },
    })
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    await waitFor(() => {
      const body = corpoDaChamada('POST', '/api/recurring')
      expect(body.amount_min_cents).toBe(1200)
      expect(body.amount_max_cents).toBe(60000)
    })
  })

  it('valor máximo menor que o mínimo: erro no cliente, NÃO chama a API', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
    )
    vi.mocked(api).mockClear()

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Errado' },
    })
    await user.click(screen.getByRole('checkbox', { name: 'Varia?' }))
    fireEvent.change(screen.getByLabelText('Valor mínimo'), {
      target: { value: '600,00' },
    })
    fireEvent.change(screen.getByLabelText('Valor máximo'), {
      target: { value: '12,00' },
    })
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'não pode ser menor que o mínimo',
    )
    expect(api).not.toHaveBeenCalled()
  })

  // POST 201 + GET seguinte caindo. Antes os dois moravam no mesmo `try`:
  // o dono lia "falhou", criava de novo, e o Comprometido passava a contar
  // a mesma recorrente DUAS vezes — a dupla contagem que este módulo
  // existe pra matar.
  it('recorrente criada mas recarga falhou: diz que criou e avisa da dupla contagem', async () => {
    let gets = 0
    mockApi({
      recurring: () => {
        gets++
        // 1º GET = mount; o 2º é o `carregar()` de depois do POST.
        if (gets >= 2) {
          throw new ApiError(503, 'sem_conexao', 'sem conexão com o servidor')
        }
        return recorrentes
      },
    })

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Contador' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '250,00' },
    })
    fireEvent.change(screen.getByLabelText('Começa em'), {
      target: { value: '2026-01-01' },
    })
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/A recorrente "Contador" foi criada/i)
    expect(alerta).toHaveTextContent(/não consegui recarregar a lista/i)
    expect(alerta).toHaveTextContent(/não envie de novo/i)
    expect(alerta).toHaveTextContent(/duas vezes/i)
    expect(alerta.textContent ?? '').not.toMatch(/falh/i)
    expect(alerta.textContent ?? '').not.toMatch(/sem conexão/)
    expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument()
  })

  // Editar é PUT: reenviar não duplica nada, então a mensagem NÃO carrega o
  // aviso de "não envie de novo" — genérico onde o reenvio custa dinheiro é
  // ruim, mas alarme onde não custa nada também é.
  it('edição salva mas recarga falhou: diz que salvou, SEM o aviso de duplicata', async () => {
    let gets = 0
    mockApi({
      recurring: () => {
        gets++
        if (gets >= 2) {
          throw new ApiError(503, 'sem_conexao', 'sem conexão com o servidor')
        }
        return recorrentes
      },
    })
    const user = userEvent.setup()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-das')).toBeInTheDocument(),
    )

    const linhaDas = within(screen.getByTestId('recorrente-r-das'))
    await user.click(linhaDas.getByRole('button', { name: 'Editar' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Descrição')).toHaveValue('DAS'),
    )
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/A recorrente "DAS" foi salva/i)
    expect(alerta).toHaveTextContent(/não consegui recarregar a lista/i)
    expect(alerta.textContent ?? '').not.toMatch(/não envie de novo/i)
    expect(alerta.textContent ?? '').not.toMatch(/duplicad/i)
    expect(alerta.textContent ?? '').not.toMatch(/falh/i)
  })

  it('falha REAL do POST continua mostrando a mensagem do servidor', async () => {
    mockApi({
      post: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'Dia do mês precisa estar entre 1 e 31.',
        )
      },
    })

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Contador' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '250,00' },
    })
    fireEvent.change(screen.getByLabelText('Começa em'), {
      target: { value: '2026-01-01' },
    })
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Dia do mês precisa estar entre 1 e 31.')
    // Falha de MUTAÇÃO nunca vira a mensagem de recarga.
    expect(alerta.textContent ?? '').not.toMatch(/foi criada/i)
  })

  it('editar preenche o formulário com os valores da linha (incl. faixa e status pausada)', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-das')).toBeInTheDocument(),
    )

    const linhaDas = within(screen.getByTestId('recorrente-r-das'))
    await user.click(linhaDas.getByRole('button', { name: 'Editar' }))

    expect(
      screen.getByRole('heading', { name: 'Editar recorrente' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Descrição')).toHaveValue('DAS')
    expect(screen.getByLabelText('Dia do mês')).toHaveValue(20)
    expect(screen.getByLabelText('Categoria')).toHaveValue('c-das')
    expect(screen.getByLabelText('Conta')).toHaveValue('a1')
    expect(screen.getByRole('checkbox', { name: 'Varia?' })).toBeChecked()
    expect(screen.getByLabelText('Valor mínimo')).toHaveValue('12,00')
    expect(screen.getByLabelText('Valor máximo')).toHaveValue('600,00')
    // r-das está PAUSADA (active: 0) — o checkbox "Ativa" reflete isso.
    expect(screen.getByRole('checkbox', { name: 'Ativa' })).not.toBeChecked()
  })

  it('editar e salvar chama PUT /api/recurring/:id com os campos atualizados', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-das')).toBeInTheDocument(),
    )

    const linhaDas = within(screen.getByTestId('recorrente-r-das'))
    await user.click(linhaDas.getByRole('button', { name: 'Editar' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Descrição')).toHaveValue('DAS'),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'DAS — Simples Nacional' },
    })
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    await waitFor(() => {
      const body = corpoDaChamada('PUT', '/api/recurring/r-das')
      expect(body.description).toBe('DAS — Simples Nacional')
      expect(body.amount_min_cents).toBe(1200)
      expect(body.amount_max_cents).toBe(60000)
    })
  })

  it('cancelar edição volta pro formulário de criação sem chamar a API', async () => {
    mockApi()
    const user = userEvent.setup()

    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('recorrente-r-das')).toBeInTheDocument(),
    )

    const linhaDas = within(screen.getByTestId('recorrente-r-das'))
    await user.click(linhaDas.getByRole('button', { name: 'Editar' }))
    expect(
      screen.getByRole('heading', { name: 'Editar recorrente' }),
    ).toBeInTheDocument()
    vi.mocked(api).mockClear()

    await user.click(screen.getByRole('button', { name: 'Cancelar edição' }))

    expect(
      screen.getByRole('heading', { name: 'Nova recorrente' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Descrição')).toHaveValue('')
    expect(api).not.toHaveBeenCalled()
  })

  // Exclusão via Dialog do design system, nunca window.confirm — mesmo
  // padrão de debt-detail.tsx (ver comentário de ConfirmacaoPendente em
  // recorrentes.tsx pro motivo).
  describe('excluir recorrente', () => {
    it('pede confirmação; cancelar NÃO chama a API', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
      )
      vi.mocked(api).mockClear()

      const linha = within(screen.getByTestId('recorrente-r-starlink'))
      await user.click(linha.getByRole('button', { name: 'Excluir' }))

      const dialogo = await screen.findByRole('heading', {
        name: 'Excluir recorrente',
      })
      expect(dialogo).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toHaveTextContent('Starlink')

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(
        screen.queryByRole('heading', { name: 'Excluir recorrente' }),
      ).not.toBeInTheDocument()
      expect(api).not.toHaveBeenCalled()
    })

    it('confirmar chama DELETE e recarrega a lista', async () => {
      mockApi({
        recurring: vi
          .fn()
          .mockResolvedValueOnce(recorrentes)
          .mockResolvedValueOnce([recorrentes[1]]),
      })
      const user = userEvent.setup()

      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
      )

      const linha = within(screen.getByTestId('recorrente-r-starlink'))
      await user.click(linha.getByRole('button', { name: 'Excluir' }))
      await screen.findByRole('heading', { name: 'Excluir recorrente' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(api).toHaveBeenCalledWith('/api/recurring/r-starlink', {
          method: 'DELETE',
        }),
      )
      await waitFor(() =>
        expect(
          screen.queryByTestId('recorrente-r-starlink'),
        ).not.toBeInTheDocument(),
      )
    })

    it('erro do servidor ao excluir mostra role="alert" com a mensagem, sem derrubar a tela', async () => {
      mockApi({
        del: () => {
          throw new ApiError(404, 'not_found', 'recorrente não encontrada')
        },
      })
      const user = userEvent.setup()

      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
      )

      const linha = within(screen.getByTestId('recorrente-r-starlink'))
      await user.click(linha.getByRole('button', { name: 'Excluir' }))
      await screen.findByRole('heading', { name: 'Excluir recorrente' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'recorrente não encontrada',
        ),
      )
      // A tela continua de pé — a linha ainda está lá (a exclusão falhou).
      expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument()
    })

    // DELETE 200 + GET seguinte caindo. Não corrompe dado (reenviar dá 404),
    // mas ler "falhou" depois de uma exclusão que ACONTECEU não tem saída:
    // a linha continua na tela, e tentar de novo devolve "não encontrada".
    it('exclusão feita mas recarga falhou: diz que excluiu, nunca que falhou', async () => {
      let gets = 0
      mockApi({
        recurring: () => {
          gets++
          if (gets >= 2) {
            throw new ApiError(503, 'sem_conexao', 'sem conexão com o servidor')
          }
          return recorrentes
        },
      })
      const user = userEvent.setup()

      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
      )

      const linha = within(screen.getByTestId('recorrente-r-starlink'))
      await user.click(linha.getByRole('button', { name: 'Excluir' }))
      await screen.findByRole('heading', { name: 'Excluir recorrente' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent(/A recorrente "Starlink" foi excluída/i)
      expect(alerta).toHaveTextContent(/não consegui recarregar a lista/i)
      expect(alerta).toHaveTextContent(
        /nenhum lançamento já feito foi apagado/i,
      )
      expect(alerta.textContent ?? '').not.toMatch(/falh/i)
      expect(alerta.textContent ?? '').not.toMatch(/sem conexão/)

      // O DELETE em si aconteceu.
      expect(api).toHaveBeenCalledWith('/api/recurring/r-starlink', {
        method: 'DELETE',
      })
    })
  })

  it('erro ao carregar mostra role="alert"', async () => {
    mockApi({
      recurring: () => {
        throw new ApiError(
          503,
          'auth_unavailable',
          'sem conexão com o servidor',
        )
      },
    })

    render(<RecorrentesPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'sem conexão com o servidor',
      ),
    )
  })
})

describe('RecorrentesPage — alvos de toque de Editar/Excluir', () => {
  it('Editar e Excluir são alvos de 44px, com o destrutivo na outra ponta', async () => {
    // ⚠️ MEDIDO em Chrome real a 390×844: `Editar` a **34×16 px** e
    // `Excluir` a **38,6×16 px**, separados por **12 px**. Os 16 px de
    // altura ficam abaixo até do mínimo de 24×24 do WCAG 2.5.8 (AA) — não
    // só do alvo de 44 do 2.5.5 (AAA) que este app adotou.
    //
    // É exatamente o par (alvo minúsculo + destrutivo colado no rotineiro)
    // já medido e corrigido em `extrato` e `categorias`: com ~34 px de
    // contato, o polegar cobre os dois, e errar aqui apaga a recorrente —
    // que é o que alimenta o Comprometido.
    //
    // jsdom não tem layout: o que se trava aqui é a REGRA aplicada (a caixa
    // de 44 px e a separação), não o pixel. O pixel foi medido no browser.
    mockApi()

    render(<RecorrentesPage />)

    const editar = await screen.findByTestId('editar-r-starlink')
    const excluir = screen.getByTestId('excluir-r-starlink')

    expect(editar.className).toContain('min-h-11')
    expect(excluir.className).toContain('min-h-11')

    // `ml-auto` só no destrutivo: é ele que troca os 12 px de distância por
    // toda a sobra da linha.
    expect(excluir.className).toContain('ml-auto')
    expect(editar.className).not.toContain('ml-auto')
  })
})
