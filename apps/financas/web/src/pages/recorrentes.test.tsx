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
import * as todasAsHistorias from './recorrentes.stories'

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
    frequency: 'monthly',
    generate_since: null,
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
    frequency: 'monthly',
    generate_since: null,
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
      expect(screen.getByTestId('pagina-recorrentes')).toBeInTheDocument(),
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

  // Item 3 (recorrência automática): o corpo ganhou `frequency` e
  // `auto_generate`, sempre explícitos — o padrão do formulário é mensal e
  // desligado, o mesmo comportamento de antes da frequência existir.
  it('cria recorrente FIXA (sem marcar "varia?"): amount_max_cents === amount_min_cents, mensal e sem lançar sozinha', async () => {
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
        frequency: 'monthly',
        auto_generate: false,
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

  // ⑤ Agrupamento por ativa/pausada + a faixa como número destacado.
  describe('grupos ativa/pausada e a faixa em destaque', () => {
    it('separa em "Ativas" e "Pausadas", cada uma no seu grupo', async () => {
      mockApi()
      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
      )

      // Ativa × pausada muda o SIGNIFICADO da linha: só `active = 1` entra em
      // `commitments()`. Numa lista plana as duas liam igual.
      const ativas = screen.getByTestId('grupo-ativas')
      const pausadas = screen.getByTestId('grupo-pausadas')

      expect(
        within(ativas).getByTestId('recorrente-r-starlink'),
      ).toBeInTheDocument()
      expect(
        within(ativas).queryByTestId('recorrente-r-das'),
      ).not.toBeInTheDocument()

      expect(
        within(pausadas).getByTestId('recorrente-r-das'),
      ).toBeInTheDocument()
      expect(
        within(pausadas).queryByTestId('recorrente-r-starlink'),
      ).not.toBeInTheDocument()

      // Ativas primeiro: é o grupo que responde "o que compromete meu mês?".
      expect(ativas.compareDocumentPosition(pausadas)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      )
    })

    it('o cabeçalho de grupo usa ROTULO_SECAO e conta os itens', async () => {
      mockApi()
      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
      )

      const cabecalho = within(screen.getByTestId('grupo-ativas')).getByText(
        /^Ativas/,
      )
      expect(cabecalho).toHaveTextContent('Ativas · 1')
      // A assinatura em versalete mono do admin — some se virar texto solto.
      expect(cabecalho.className).toContain('font-mono')
      expect(cabecalho.className).toContain('uppercase')
    })

    it('grupo vazio não renderiza — nada de "Pausadas · 0"', async () => {
      // Só ativas: o grupo de pausadas não deve existir no DOM.
      mockApi({ recurring: () => [recorrentes[0]] })
      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
      )

      expect(screen.getByTestId('grupo-ativas')).toBeInTheDocument()
      expect(screen.queryByTestId('grupo-pausadas')).not.toBeInTheDocument()
    })

    // ⚠️ O ponto da tela: a faixa é a razão de ela existir, e NUNCA vira média.
    it('a faixa fica em destaque (NUMERO_GRID) e mostra os DOIS extremos', async () => {
      mockApi()
      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-das')).toBeInTheDocument(),
      )

      const faixa = screen.getByTestId('faixa-r-das')
      // Destaque: 24px + tabular-nums, não mais o `text-sm` espremido na
      // ponta direita da linha.
      expect(faixa.className).toContain('text-2xl')
      expect(faixa.className).toContain('tabular-nums')

      // Os dois extremos, com o texto intacto.
      expect(faixa).toHaveTextContent('R$ 12,00 a R$ 600,00')
      // A média de 12 e 600 é 306 — se algum dia alguém "simplificar" a faixa
      // num número só, é isto que apareceria.
      expect(faixa).not.toHaveTextContent('R$ 306,00')
    })

    it('cada extremo é um span nowrap — a quebra cai no " a ", nunca dentro de um número', async () => {
      mockApi()
      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-das')).toBeInTheDocument(),
      )

      // MEDIDO em Chrome real: hoje a faixa mais longa (282 px) cabe nos
      // 306 px úteis, em uma caixa de linha só. Os nowrap são a guarda pro
      // dia em que essa margem de 24 px acabar — sem eles a quebra pode cair
      // DENTRO de um valor e deixar um `R$` órfão, o mesmo defeito já pago
      // em `pages/accounts.tsx`.
      const faixa = screen.getByTestId('faixa-r-das')
      const partes = faixa.querySelectorAll('span.whitespace-nowrap')
      expect(partes).toHaveLength(2)
      expect(partes[0]).toHaveTextContent('R$ 12,00')
      expect(partes[1]).toHaveTextContent('R$ 600,00')
    })

    it('valor fixo (min === max) continua UM número só, num span nowrap', async () => {
      mockApi()
      render(<RecorrentesPage />)
      await waitFor(() =>
        expect(screen.getByTestId('recorrente-r-starlink')).toBeInTheDocument(),
      )

      const faixa = screen.getByTestId('faixa-r-starlink')
      expect(faixa).toHaveTextContent('R$ 189,00')
      expect(faixa).not.toHaveTextContent('R$ 189,00 a R$ 189,00')
      // ⚠️ Centavos PRESERVADOS: `formatBRLSemCentavos` arredondaria
      // (R$ 189,50 viraria "R$ 190"), e esta é a definição da recorrente.
      expect(faixa).not.toHaveTextContent('R$ 189 ')
      expect(faixa.querySelectorAll('span.whitespace-nowrap')).toHaveLength(1)
    })
  })
})

// Item 3 — recorrência automática. Fixtures fictícias: nenhum dado real.
const contaFicticia = {
  id: 'a-cc',
  name: 'Conta corrente',
  scope: 'PF',
  kind: 'checking',
  closing_day: null,
  due_day: null,
  balance_cents: 0,
}

function recorrenteFicticia(patch: Record<string, unknown> = {}) {
  return {
    id: 'r-internet',
    description: 'Internet fibra',
    category_id: null,
    account_id: 'a-cc',
    scope: 'PF',
    day_of_month: 10,
    amount_min_cents: 9990,
    amount_max_cents: 9990,
    starts_on: '2026-01-01',
    ends_on: null,
    active: 1,
    notes: null,
    frequency: 'monthly',
    generate_since: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...patch,
  }
}

const academia = recorrenteFicticia({
  id: 'r-academia',
  description: 'Academia',
  frequency: 'weekly',
  // 2026-11-02 é uma segunda: dia 2 é o que o formulário deriva.
  starts_on: '2026-11-02',
  day_of_month: 2,
  amount_min_cents: 4000,
  amount_max_cents: 6000,
  generate_since: '2026-11-05',
})

async function abrirComFicticias(
  lista: unknown[] = [recorrenteFicticia(), academia],
) {
  mockApi({ recurring: () => lista, contas: () => [contaFicticia] })
  render(<RecorrentesPage />)
  await waitFor(() =>
    expect(screen.getByTestId('pagina-recorrentes')).toBeInTheDocument(),
  )
}

function preencherBasico(descricao = 'Academia', valor = '40,00') {
  fireEvent.change(screen.getByLabelText('Descrição'), {
    target: { value: descricao },
  })
  fireEvent.change(screen.getByLabelText('Valor'), {
    target: { value: valor },
  })
}

describe('RecorrentesPage — frequência (item 3)', () => {
  it('o select Frequência começa em Mensal, com as quatro opções na ordem', async () => {
    await abrirComFicticias()

    const select = screen.getByLabelText('Frequência') as HTMLSelectElement
    expect(select).toHaveValue('monthly')
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Mensal',
      'Semanal',
      'Quinzenal — a cada 14 dias',
      'Anual',
    ])
  })

  it.each([
    ['weekly', 'Semanal', /a cada 7 dias/i],
    [
      'biweekly',
      'Quinzenal — a cada 14 dias',
      /a cada 14 dias.*não é dia 1 e dia 15/i,
    ],
  ])(
    '%s esconde "Dia do mês", o início vira "Primeira ocorrência" e o dia vai derivado dela',
    async (valor, _rotulo, dica) => {
      await abrirComFicticias()

      preencherBasico()
      // Um dia inválido digitado ANTES de trocar a frequência não pode
      // travar o envio: o campo some e o valor dele deixa de valer.
      fireEvent.change(screen.getByLabelText('Dia do mês'), {
        target: { value: '99' },
      })
      fireEvent.change(screen.getByLabelText('Frequência'), {
        target: { value: valor },
      })

      expect(screen.queryByLabelText('Dia do mês')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Começa em')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Frequência')).toHaveAccessibleDescription(
        dica,
      )

      fireEvent.change(screen.getByLabelText('Primeira ocorrência'), {
        target: { value: '2026-11-02' },
      })
      fireEvent.submit(screen.getByTestId('form-recorrente'))

      await waitFor(() => {
        const body = corpoDaChamada('POST', '/api/recurring')
        expect(body.frequency).toBe(valor)
        expect(body.starts_on).toBe('2026-11-02')
        expect(body.day_of_month).toBe(2)
      })
    },
  )

  it('anual mantém "Dia do mês" e explica que o mês é o do início', async () => {
    await abrirComFicticias()

    fireEvent.change(screen.getByLabelText('Frequência'), {
      target: { value: 'annual' },
    })

    expect(screen.getByLabelText('Dia do mês')).toBeInTheDocument()
    expect(screen.getByLabelText('Começa em')).toBeInTheDocument()
    expect(screen.getByLabelText('Frequência')).toHaveAccessibleDescription(
      /uma vez por ano.*mês em que a recorrente começa/i,
    )

    preencherBasico('Anuidade', '120,00')
    fireEvent.change(screen.getByLabelText('Dia do mês'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Começa em'), {
      target: { value: '2026-03-01' },
    })
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    await waitFor(() => {
      const body = corpoDaChamada('POST', '/api/recurring')
      expect(body.frequency).toBe('annual')
      expect(body.day_of_month).toBe(5)
    })
  })

  it('editar uma semanal preenche a frequência e o PUT a reenvia', async () => {
    await abrirComFicticias()
    const user = userEvent.setup()

    await user.click(
      within(screen.getByTestId('recorrente-r-academia')).getByRole('button', {
        name: 'Editar',
      }),
    )

    expect(screen.getByLabelText('Frequência')).toHaveValue('weekly')
    expect(screen.getByLabelText('Primeira ocorrência')).toHaveValue(
      '2026-11-02',
    )
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    await waitFor(() => {
      const body = corpoDaChamada('PUT', '/api/recurring/r-academia')
      expect(body.frequency).toBe('weekly')
      expect(body.day_of_month).toBe(2)
    })
  })

  it('a linha diz a frequência; a semanal mostra o dia da semana no bloco, não um dia do mês', async () => {
    await abrirComFicticias([
      recorrenteFicticia(),
      academia,
      recorrenteFicticia({
        id: 'r-anuidade',
        description: 'Anuidade',
        frequency: 'annual',
        day_of_month: 5,
        starts_on: '2026-03-01',
      }),
    ])

    const internet = screen.getByTestId('recorrente-r-internet')
    expect(internet).toHaveTextContent(/mensal, dia 10/)
    expect(screen.getByTestId('bloco-dia-r-internet')).toHaveTextContent('10')

    expect(screen.getByTestId('recorrente-r-academia')).toHaveTextContent(
      /semanal, às segundas/,
    )
    expect(screen.getByTestId('bloco-dia-r-academia')).toHaveTextContent('seg')

    expect(screen.getByTestId('recorrente-r-anuidade')).toHaveTextContent(
      /anual, 5 de março/,
    )
  })
})

describe('RecorrentesPage — lançar sozinho como pendente (item 3)', () => {
  it('sem conta, o checkbox fica desabilitado e o motivo está em texto', async () => {
    await abrirComFicticias()

    const caixa = screen.getByRole('checkbox', {
      name: 'Lançar sozinho como pendente',
    })
    expect(screen.getByLabelText('Conta')).toHaveValue('')
    expect(caixa).toBeDisabled()
    expect(caixa).not.toBeChecked()
    // Cor não é o único sinal: o porquê vem escrito e ligado ao controle.
    expect(caixa).toHaveAccessibleDescription(/escolha a conta/i)
  })

  it('com conta, liga e o POST manda auto_generate: true', async () => {
    await abrirComFicticias()
    const user = userEvent.setup()

    preencherBasico('Internet fibra', '99,90')
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a-cc' },
    })
    const caixa = screen.getByRole('checkbox', {
      name: 'Lançar sozinho como pendente',
    })
    expect(caixa).toBeEnabled()
    await user.click(caixa)
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    await waitFor(() => {
      const body = corpoDaChamada('POST', '/api/recurring')
      expect(body.auto_generate).toBe(true)
      expect(body.account_id).toBe('a-cc')
    })
  })

  it('tirar a conta desliga o checkbox: nunca manda auto_generate true sem conta', async () => {
    await abrirComFicticias()
    const user = userEvent.setup()

    preencherBasico('Internet fibra', '99,90')
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a-cc' },
    })
    await user.click(
      screen.getByRole('checkbox', { name: 'Lançar sozinho como pendente' }),
    )
    fireEvent.change(screen.getByLabelText('Conta'), { target: { value: '' } })
    // Voltar a escolher a conta não religa por baixo dos panos.
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a-cc' },
    })
    expect(
      screen.getByRole('checkbox', { name: 'Lançar sozinho como pendente' }),
    ).not.toBeChecked()

    fireEvent.change(screen.getByLabelText('Conta'), { target: { value: '' } })
    fireEvent.submit(screen.getByTestId('form-recorrente'))
    await waitFor(() => {
      const body = corpoDaChamada('POST', '/api/recurring')
      expect(body.auto_generate).toBe(false)
      expect(body.account_id).toBeNull()
    })
  })

  it('a ajuda explica o valor máximo, a conciliação com a importação e que apagar não volta', async () => {
    await abrirComFicticias()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Lançar sozinho' }),
    )

    const texto = (await screen.findByText(/no dia do vencimento/i)).textContent
    expect(texto).toMatch(/pendente/i)
    expect(texto).toMatch(/valor máximo da faixa/i)
    expect(texto).toMatch(/importação.*dentro da faixa.*atualizad/i)
    expect(texto).toMatch(/apagar o pendente não o faz voltar/i)
  })

  it('editar uma que já lança sozinha marca o checkbox, diz desde quando, e o PUT mantém ligado', async () => {
    await abrirComFicticias()
    const user = userEvent.setup()

    await user.click(
      within(screen.getByTestId('recorrente-r-academia')).getByRole('button', {
        name: 'Editar',
      }),
    )

    const caixa = screen.getByRole('checkbox', {
      name: 'Lançar sozinho como pendente',
    })
    expect(caixa).toBeChecked()
    expect(caixa).toHaveAccessibleDescription(/ligado desde 05\/11\/2026/i)

    fireEvent.submit(screen.getByTestId('form-recorrente'))
    await waitFor(() => {
      const body = corpoDaChamada('PUT', '/api/recurring/r-academia')
      expect(body.auto_generate).toBe(true)
    })
  })

  it('desligar na edição manda auto_generate: false', async () => {
    await abrirComFicticias()
    const user = userEvent.setup()

    await user.click(
      within(screen.getByTestId('recorrente-r-academia')).getByRole('button', {
        name: 'Editar',
      }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Lançar sozinho como pendente' }),
    )
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    await waitFor(() => {
      const body = corpoDaChamada('PUT', '/api/recurring/r-academia')
      expect(body.auto_generate).toBe(false)
    })
  })

  it('selo "lança sozinha" só na ativa com generate_since; pausada não ganha selo', async () => {
    await abrirComFicticias([
      recorrenteFicticia(),
      academia,
      recorrenteFicticia({
        id: 'r-pausada',
        description: 'Curso pausado',
        active: 0,
        generate_since: '2026-10-01',
      }),
    ])

    expect(screen.getByTestId('lanca-sozinha-r-academia')).toHaveTextContent(
      'lança sozinha',
    )
    expect(
      screen.queryByTestId('lanca-sozinha-r-internet'),
    ).not.toBeInTheDocument()
    // Pausada não gera (só active = 1 entra na geração): o selo mentiria.
    expect(
      screen.queryByTestId('lanca-sozinha-r-pausada'),
    ).not.toBeInTheDocument()
  })

  it('ligada mas sem conta (conta apagada depois): o selo diz que não lança', async () => {
    await abrirComFicticias([
      recorrenteFicticia({ account_id: null, generate_since: '2026-11-01' }),
    ])

    expect(screen.getByTestId('lanca-sozinha-r-internet')).toHaveTextContent(
      'sem conta, não lança',
    )
  })

  it('o rótulo do checkbox é um alvo de 44 px', async () => {
    await abrirComFicticias()

    const rotulo = screen
      .getByRole('checkbox', { name: 'Lançar sozinho como pendente' })
      .closest('label') as HTMLElement
    expect(rotulo.className).toContain('min-h-11')
  })

  it('recusa do servidor (422) aparece no alerta do formulário', async () => {
    mockApi({
      contas: () => [contaFicticia],
      post: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'para lançar sozinha, a recorrente precisa de uma conta',
        )
      },
    })
    render(<RecorrentesPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-recorrentes')).toBeInTheDocument(),
    )

    preencherBasico('Internet fibra', '99,90')
    fireEvent.submit(screen.getByTestId('form-recorrente'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'para lançar sozinha, a recorrente precisa de uma conta',
    )
  })
})

describe('RecorrentesPage — KPIs contam as ocorrências do mês (item 3)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('custo do mês: a semanal pesa uma vez por ocorrência; o próximo vencimento é a data mais próxima', async () => {
    // Só o relógio é falso: userEvent/waitFor continuam com timers reais.
    vi.useFakeTimers({ toFake: ['Date'] })
    // 12:00 em Teresina de uma quarta, 2026-11-11.
    vi.setSystemTime(new Date('2026-11-11T15:00:00Z'))

    await abrirComFicticias([
      recorrenteFicticia(),
      academia,
      recorrenteFicticia({
        id: 'r-pausada',
        description: 'Curso pausado',
        active: 0,
        amount_min_cents: 18900,
        amount_max_cents: 18900,
      }),
    ])

    // Internet 99,90 (dia 10) + Academia 40–60 × 5 segundas de novembro.
    expect(screen.getByTestId('kpi-custo-fixo-valor')).toHaveTextContent(
      'R$ 299,90 a R$ 399,90',
    )
    expect(screen.getByTestId('kpi-custo-fixo')).toHaveTextContent(/novembro/)

    // Internet já venceu dia 10; a próxima segunda é 16/11.
    expect(screen.getByTestId('kpi-proximo-valor')).toHaveTextContent('16/11')
    expect(screen.getByTestId('kpi-proximo')).toHaveTextContent('Academia')
  })
})

const { default: _meta, ...historias } = todasAsHistorias

describe('recorrentes.stories — os estados da linha e do "lançar sozinho"', () => {
  it('cada story mostra o estado que o nome promete', () => {
    const esperado: Record<string, (c: HTMLElement) => void> = {
      LinhaMensal: (c) => {
        expect(c).toHaveTextContent(/mensal, dia 10/)
        expect(within(c).queryByText(/lança sozinha/)).not.toBeInTheDocument()
      },
      LinhaSemanal: (c) => {
        expect(c).toHaveTextContent(/semanal, às segundas/)
        expect(within(c).getByText('seg')).toBeInTheDocument()
      },
      LinhaQuinzenal: (c) =>
        expect(c).toHaveTextContent(/quinzenal, a cada 14 dias, às segundas/),
      LinhaAnual: (c) => expect(c).toHaveTextContent(/anual, 5 de março/),
      LinhaLancaSozinha: (c) =>
        expect(within(c).getByText('lança sozinha')).toBeInTheDocument(),
      LinhaSemConta: (c) =>
        expect(within(c).getByText('sem conta, não lança')).toBeInTheDocument(),
      CampoDesligado: (c) => {
        const caixa = within(c).getByRole('checkbox')
        expect(caixa).toBeEnabled()
        expect(caixa).not.toBeChecked()
      },
      CampoLigadoDesde: (c) => {
        expect(within(c).getByRole('checkbox')).toBeChecked()
        expect(c).toHaveTextContent(/ligado desde 05\/11\/2026/i)
      },
      CampoSemConta: (c) => {
        expect(within(c).getByRole('checkbox')).toBeDisabled()
        expect(c).toHaveTextContent(/escolha a conta/i)
      },
    }
    expect(Object.keys(historias).sort()).toEqual(Object.keys(esperado).sort())
    for (const [nome, h] of Object.entries(historias)) {
      const Componente = h.render as unknown as (
        p: Record<string, unknown>,
      ) => React.ReactElement
      const { container, unmount } = render(<Componente {...h.args} />)
      esperado[nome](container)
      unmount()
    }
  })
})
