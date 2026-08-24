import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountsPage } from './accounts'

const contas = [
  {
    id: 'a1',
    name: 'Nubank',
    scope: 'PF',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 234012,
  },
  {
    id: 'a2',
    name: 'Nubank cartao',
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
    balance_cents: -184790,
  },
  {
    id: 'a3',
    name: 'Inter PJ',
    scope: 'PJ',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 412000,
  },
]

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ status, json: async () => body }),
  )
}

/**
 * GET /api/accounts devolve `initial` na primeira chamada e `depois` (ou
 * `initial` de novo) nas seguintes — é o que permite testar "criei a conta e
 * ela aparece depois do recarregar" sem reimplementar o backend.
 *
 * O POST é roteado por PATH (não só por método): `/api/accounts` é a criação,
 * `/api/accounts/:id/archive` é o arquivamento. Sem essa separação, um teste
 * de arquivamento passaria batendo no mock de criação e não provaria nada.
 *
 * `getFalhaApartirDe` faz o GET rejeitar a partir da N-ésima chamada — é o
 * que reproduz "a mutação deu 200 e a rede caiu antes do recarregar", o
 * cenário que `lib/mutar-e-recarregar.ts` existe pra tratar.
 */
function mockRoutes(opts: {
  initial: unknown[]
  depois?: unknown[]
  post?: { status: number; body: unknown }
  archive?: { status: number; body: unknown }
  getFalhaApartirDe?: number
  bills?: unknown[]
}) {
  let getCount = 0
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST' && path.endsWith('/archive')) {
      const archive = opts.archive ?? {
        status: 200,
        body: { ok: true, data: { archived: true }, notifications: [] },
      }
      return { status: archive.status, json: async () => archive.body }
    }
    if (init?.method === 'POST') {
      const post = opts.post ?? {
        status: 201,
        body: { ok: true, data: { id: 'nova' }, notifications: [] },
      }
      return { status: post.status, json: async () => post.body }
    }
    // `GET /api/bills` é do painel de pagar fatura (`blocos/PagarFatura.tsx`),
    // roteado por PATH e FORA da contagem de `getCount` — ele não é uma
    // recarga da lista de contas, e misturá-lo faria o "depois" chegar cedo.
    if (path.startsWith('/api/bills')) {
      return {
        status: 200,
        json: async () => ({
          ok: true,
          data: opts.bills ?? [],
          notifications: [],
        }),
      }
    }
    getCount++
    if (
      opts.getFalhaApartirDe !== undefined &&
      getCount >= opts.getFalhaApartirDe
    ) {
      // Rede caindo de verdade: `fetch` rejeita, não devolve um envelope
      // de erro — é o modo de falha do Android do dono num sinal ruim.
      throw new TypeError('Failed to fetch')
    }
    const data = getCount === 1 ? opts.initial : (opts.depois ?? opts.initial)
    return {
      status: 200,
      json: async () => ({ ok: true, data, notifications: [] }),
    }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function corpoDoPost(fetchMock: ReturnType<typeof mockRoutes>) {
  const post = fetchMock.mock.calls.find(
    ([path, init]) =>
      (init as RequestInit)?.method === 'POST' && path === '/api/accounts',
  )
  return JSON.parse((post![1] as RequestInit).body as string) as Record<
    string,
    unknown
  >
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountsPage', () => {
  it('agrupa por scope e formata saldo com formatBRL', async () => {
    mockFetch({ ok: true, data: contas, notifications: [] })

    render(<AccountsPage />)

    await waitFor(() =>
      expect(screen.getByTestId('grupo-PF')).toBeInTheDocument(),
    )

    const pf = within(screen.getByTestId('grupo-PF'))
    expect(pf.getByText('Nubank')).toBeInTheDocument()
    expect(pf.getByTestId('saldo-a1')).toHaveTextContent('R$ 2.340,12')
    expect(pf.getByTestId('saldo-a2')).toHaveTextContent('-R$ 1.847,90')

    const pj = within(screen.getByTestId('grupo-PJ'))
    expect(pj.getByTestId('saldo-a3')).toHaveTextContent('R$ 4.120,00')
    expect(pj.queryByText('Nubank')).not.toBeInTheDocument()
  })

  it('mostra fechamento e vencimento so no cartao', async () => {
    mockFetch({ ok: true, data: contas, notifications: [] })

    render(<AccountsPage />)

    await waitFor(() =>
      expect(screen.getByTestId('fatura-a2')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('fatura-a2')).toHaveTextContent(
      'fecha 25 · vence 05',
    )
    expect(screen.queryByTestId('fatura-a1')).not.toBeInTheDocument()
  })

  it('mostra a mensagem de erro da API', async () => {
    mockFetch(
      {
        ok: false,
        data: null,
        notifications: [
          { type: 'error', code: 'forbidden', message: 'acesso negado' },
        ],
      },
      403,
    )

    render(<AccountsPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('acesso negado'),
    )
  })

  it('cria uma conta nova, posta o corpo certo e ela aparece na listagem apos recarregar', async () => {
    const novaConta = {
      id: 'nova',
      name: 'Caixinha',
      scope: 'PF',
      kind: 'savings',
      closing_day: null,
      due_day: null,
      balance_cents: 0,
    }
    const fetchMock = mockRoutes({ initial: [], depois: [novaConta] })

    render(<AccountsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nome')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Caixinha' },
    })
    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: 'savings' },
    })
    fireEvent.submit(screen.getByTestId('form-nova-conta'))

    await waitFor(() =>
      expect(screen.getByText('Caixinha')).toBeInTheDocument(),
    )

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === 'POST',
    )
    expect(post![0]).toBe('/api/accounts')
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({
      name: 'Caixinha',
      scope: 'PF',
      kind: 'savings',
    })
  })

  it('cartao sem dia de fechamento mostra erro legivel e nao chama a API', async () => {
    const fetchMock = mockRoutes({ initial: [] })

    render(<AccountsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nome')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Nubank cartao' },
    })
    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: 'credit_card' },
    })
    // so aparece quando kind === 'credit_card'
    expect(screen.getByLabelText('Dia de fechamento')).toBeInTheDocument()
    fireEvent.submit(screen.getByTestId('form-nova-conta'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('fechamento'),
    )
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  // Task 5 (ajuda contextual, §3.2 do spec): "Lançar / Contas" — este é o
  // "Contas", ao lado de Escopo (PF/PJ).
  it('ajuda: "PJ / PF" (ao lado de Escopo) abre no clique', async () => {
    mockRoutes({ initial: contas })
    const user = userEvent.setup()

    render(<AccountsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nome')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre PJ / PF' }),
    )
    expect(
      await screen.findByText(/dá para pagar algo PF pelo cartão PJ/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Escopo')).toBeInTheDocument()
  })

  // `POST /api/accounts` sempre aceitou `opening_balance_cents`
  // (src/domain/accounts.ts), mas a tela nunca mandava — toda conta nascia
  // com saldo 0, e #/reserva dividia 0 pelo custo fixo mostrando "0,0 meses"
  // com alerta vermelho permanente e falso. Não existe PUT /accounts/:id:
  // sem este campo, não havia como corrigir pela interface.
  describe('saldo inicial', () => {
    async function preencherNome(valor: string) {
      await waitFor(() =>
        expect(screen.getByLabelText('Nome')).toBeInTheDocument(),
      )
      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: valor },
      })
    }

    // DECISÃO: em branco NÃO manda a chave, em vez de mandar 0 explícito.
    // `JSON.stringify` omite `undefined`, e o domínio já aplica `?? 0` — o
    // corpo do caso comum fica idêntico ao de antes desta mudança (nenhuma
    // chave nova viajando só pra dizer "o default"), e um 0 explícito seria
    // indistinguível de "o dono digitou zero de propósito".
    it('em branco não manda opening_balance_cents no corpo', async () => {
      const fetchMock = mockRoutes({ initial: [] })

      render(<AccountsPage />)
      await preencherNome('Caixinha')
      fireEvent.submit(screen.getByTestId('form-nova-conta'))

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            ([, init]) => (init as RequestInit)?.method === 'POST',
          ),
        ).toBe(true),
      )
      const body = corpoDoPost(fetchMock)
      expect('opening_balance_cents' in body).toBe(false)
      expect(body).toEqual({ name: 'Caixinha', scope: 'PF', kind: 'checking' })
    })

    it('converte reais com vírgula decimal em centavos', async () => {
      const fetchMock = mockRoutes({ initial: [] })

      render(<AccountsPage />)
      await preencherNome('Inter PJ')
      fireEvent.change(screen.getByLabelText('Saldo inicial'), {
        target: { value: '8000,50' },
      })
      fireEvent.submit(screen.getByTestId('form-nova-conta'))

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            ([, init]) => (init as RequestInit)?.method === 'POST',
          ),
        ).toBe(true),
      )
      expect(corpoDoPost(fetchMock).opening_balance_cents).toBe(800050)
    })

    it('aceita separador de milhar (8.000,50) — mesmo parseBRL das outras telas', async () => {
      const fetchMock = mockRoutes({ initial: [] })

      render(<AccountsPage />)
      await preencherNome('Inter PJ')
      fireEvent.change(screen.getByLabelText('Saldo inicial'), {
        target: { value: '8.000,50' },
      })
      fireEvent.submit(screen.getByTestId('form-nova-conta'))

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            ([, init]) => (init as RequestInit)?.method === 'POST',
          ),
        ).toBe(true),
      )
      expect(corpoDoPost(fetchMock).opening_balance_cents).toBe(800050)
    })

    it('valor inválido mostra erro legível e NÃO chama a API', async () => {
      const fetchMock = mockRoutes({ initial: [] })

      render(<AccountsPage />)
      await preencherNome('Inter PJ')
      fireEvent.change(screen.getByLabelText('Saldo inicial'), {
        target: { value: 'oito mil' },
      })
      fireEvent.submit(screen.getByTestId('form-nova-conta'))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/saldo inicial/i),
      )
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(false)
    })
  })

  // `POST /api/accounts/:id/archive` existe e é testada no Worker desde a
  // fatia ①, mas a SPA nunca a chamava: conta criada com nome ou escopo
  // errado era permanente (não há DELETE de conta), aparecendo pra sempre
  // em Contas, no BlocoSaldos e em todo <select> de #/lancar e #/dividas.
  //
  // Confirmação via `Dialog` do design system, nunca `window.confirm()` —
  // mesma decisão (e mesmo motivo) já registrada em debt-detail.tsx.
  describe('arquivar conta', () => {
    it('pede confirmação; cancelar pelo diálogo NÃO chama a API', async () => {
      const fetchMock = mockRoutes({ initial: contas })
      const user = userEvent.setup()

      render(<AccountsPage />)
      await waitFor(() =>
        expect(screen.getByTestId('arquivar-a1')).toBeInTheDocument(),
      )
      fetchMock.mockClear()

      await user.click(screen.getByTestId('arquivar-a1'))

      expect(
        await screen.findByRole('heading', { name: 'Arquivar conta' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toHaveTextContent('Nubank')

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(
        screen.queryByRole('heading', { name: 'Arquivar conta' }),
      ).not.toBeInTheDocument()
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(false)
    })

    it('confirmar posta em /archive e a lista recarrega sem a conta', async () => {
      const fetchMock = mockRoutes({
        initial: contas,
        depois: contas.filter((c) => c.id !== 'a1'),
      })
      const user = userEvent.setup()

      render(<AccountsPage />)
      await waitFor(() =>
        expect(screen.getByTestId('arquivar-a1')).toBeInTheDocument(),
      )

      await user.click(screen.getByTestId('arquivar-a1'))
      await screen.findByRole('heading', { name: 'Arquivar conta' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            ([path, init]) =>
              path === '/api/accounts/a1/archive' &&
              (init as RequestInit)?.method === 'POST',
          ),
        ).toBe(true),
      )
      // A lista recarrega: a conta arquivada some da tela.
      await waitFor(() =>
        expect(screen.queryByTestId('saldo-a1')).not.toBeInTheDocument(),
      )
      expect(screen.getByTestId('saldo-a2')).toBeInTheDocument()
    })

    it('falha da rota mostra role="alert" sem derrubar a tela', async () => {
      mockRoutes({
        initial: contas,
        archive: {
          status: 404,
          body: {
            ok: false,
            data: null,
            notifications: [
              {
                type: 'error',
                code: 'not_found',
                message: 'conta a1 nao encontrada ou ja arquivada',
              },
            ],
          },
        },
      })
      const user = userEvent.setup()

      render(<AccountsPage />)
      await waitFor(() =>
        expect(screen.getByTestId('arquivar-a1')).toBeInTheDocument(),
      )

      await user.click(screen.getByTestId('arquivar-a1'))
      await screen.findByRole('heading', { name: 'Arquivar conta' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'conta a1 nao encontrada ou ja arquivada',
        ),
      )
      // A tela continua de pé — a conta ainda está lá (o arquivamento falhou).
      expect(screen.getByTestId('saldo-a1')).toBeInTheDocument()
    })

    // O POST deu 200 e o GET seguinte caiu. Antes, os dois moravam no mesmo
    // `try`: a tela gravava o erro do GET em `acaoErro`, o dono lia "falhou",
    // tentava de novo e batia em 404 "já arquivada" — sem saída. A ação
    // ACONTECEU; a mensagem tem que dizer isso.
    it('arquivou mas o recarregar falhou: a mensagem diz que arquivou, nunca que falhou', async () => {
      const fetchMock = mockRoutes({
        initial: contas,
        getFalhaApartirDe: 2, // 1º GET = mount; o 2º é o recarregar
      })
      const user = userEvent.setup()

      render(<AccountsPage />)
      await waitFor(() =>
        expect(screen.getByTestId('arquivar-a1')).toBeInTheDocument(),
      )

      await user.click(screen.getByTestId('arquivar-a1'))
      await screen.findByRole('heading', { name: 'Arquivar conta' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent(/foi arquivada/i)
      expect(alerta).toHaveTextContent(/não consegui recarregar a lista/i)
      // NUNCA pode ler como falha da ação, nem vazar o erro do GET.
      expect(alerta.textContent ?? '').not.toMatch(/falh/i)
      expect(alerta.textContent ?? '').not.toMatch(/Failed to fetch/)

      // O POST em si aconteceu — é isso que torna a mensagem verdadeira.
      expect(
        fetchMock.mock.calls.some(
          ([path, init]) =>
            path === '/api/accounts/a1/archive' &&
            (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(true)
      // A tela não é derrubada: a lista antiga continua de pé.
      expect(screen.getByTestId('saldo-a1')).toBeInTheDocument()
    })
  })

  // Mesma forma do arquivar, defeito PRÉ-EXISTENTE: com POST e GET no mesmo
  // `try`, um 201 seguido de GET caído mostrava o erro do GET como se a
  // conta não tivesse sido criada — e reenviar criaria uma duplicata (não
  // existe DELETE de conta).
  describe('criar conta: POST ok + recarregar falhando', () => {
    it('a mensagem diz que a conta foi criada e avisa pra não reenviar', async () => {
      const fetchMock = mockRoutes({
        initial: [],
        getFalhaApartirDe: 2,
      })

      render(<AccountsPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Nome')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: 'Caixinha' },
      })
      fireEvent.submit(screen.getByTestId('form-nova-conta'))

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent(/foi criada/i)
      expect(alerta).toHaveTextContent(/não consegui recarregar a lista/i)
      expect(alerta).toHaveTextContent(/duplicada/i)
      expect(alerta.textContent ?? '').not.toMatch(/falh/i)

      expect(
        fetchMock.mock.calls.some(
          ([path, init]) =>
            path === '/api/accounts' &&
            (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(true)
    })

    it('POST falhando mostra a mensagem do SERVIDOR (não a de recarga)', async () => {
      mockRoutes({
        initial: [],
        post: {
          status: 422,
          body: {
            ok: false,
            data: null,
            notifications: [
              {
                type: 'error',
                code: 'invalid_account',
                message: 'cartao de credito exige dia de fechamento',
              },
            ],
          },
        },
      })

      render(<AccountsPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Nome')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: 'Caixinha' },
      })
      fireEvent.submit(screen.getByTestId('form-nova-conta'))

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent(
        'cartao de credito exige dia de fechamento',
      )
      expect(alerta.textContent ?? '').not.toMatch(/foi criada/i)
    })
  })

  // ③ A coluna de saldo é a única coluna numérica da tela — é ela que se lê
  // de cima a baixo comparando contas.
  it('a coluna de saldo usa tabular-nums', async () => {
    mockFetch({ ok: true, data: contas, notifications: [] })

    render(<AccountsPage />)

    await waitFor(() =>
      expect(screen.getByTestId('grupo-PF')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('saldo-a1')).toHaveClass('tabular-nums')
    expect(screen.getByTestId('saldo-a2')).toHaveClass('tabular-nums')
  })

  // ④ A home (`BlocoSaldos`) sempre mostrou o total por escopo; a tela
  // DEDICADA a contas, não — o dono somava as linhas de cabeça pra responder
  // "quanto tenho no PJ".
  describe('cabeçalho e total por escopo', () => {
    it('soma o total de cada escopo, sem NUNCA somar PJ com PF', async () => {
      mockFetch({ ok: true, data: contas, notifications: [] })

      render(<AccountsPage />)

      await waitFor(() =>
        expect(screen.getByTestId('total-PF')).toBeInTheDocument(),
      )
      // PF: 2.340,12 + (-1.847,90) = 492,22
      expect(screen.getByTestId('total-PF')).toHaveTextContent('R$ 492,22')
      // PJ: só a Inter
      expect(screen.getByTestId('total-PJ')).toHaveTextContent('R$ 4.120,00')

      // O total combinado (R$ 4.612,22) não pode existir em lugar nenhum —
      // somar PJ com PF é exatamente o que a separação existe pra impedir.
      expect(document.body.textContent).not.toContain('R$ 4.612,22')
    })

    it('o total de cada escopo mora DENTRO do card daquele escopo', async () => {
      mockFetch({ ok: true, data: contas, notifications: [] })

      render(<AccountsPage />)

      await waitFor(() =>
        expect(screen.getByTestId('grupo-PJ')).toBeInTheDocument(),
      )
      const pj = within(screen.getByTestId('grupo-PJ'))
      expect(pj.getByTestId('total-PJ')).toBeInTheDocument()
      expect(pj.queryByTestId('total-PF')).not.toBeInTheDocument()
    })

    it('a tabela ganhou cabeçalho — o número da direita é nomeado como Saldo', async () => {
      mockFetch({ ok: true, data: contas, notifications: [] })

      render(<AccountsPage />)

      await waitFor(() =>
        expect(screen.getByTestId('grupo-PJ')).toBeInTheDocument(),
      )
      const pj = within(screen.getByTestId('grupo-PJ'))
      expect(
        pj.getByRole('columnheader', { name: 'Conta' }),
      ).toBeInTheDocument()
      expect(
        pj.getByRole('columnheader', { name: 'Saldo' }),
      ).toBeInTheDocument()
    })

    it('o total usa tabular-nums, igual às linhas que ele soma', async () => {
      mockFetch({ ok: true, data: contas, notifications: [] })

      render(<AccountsPage />)

      await waitFor(() =>
        expect(screen.getByTestId('total-PF')).toBeInTheDocument(),
      )
      expect(screen.getByTestId('total-PF')).toHaveClass('tabular-nums')
    })
  })

  // ⑤ `@piluvitu/ui/badge` tinha ZERO imports no monorepo. Status que era
  // texto solto com markup próprio virou chip do design system. A asserção é
  // `inline-flex` (a base do `badgeVariants`) — é o que distingue um chip de
  // um texto corrido, e some se alguém voltar pro `<span>`/`<small>` cru.
  describe('badge do design system nos status', () => {
    it('o escopo do card (PJ/PF) é um badge', async () => {
      mockFetch({ ok: true, data: contas, notifications: [] })

      render(<AccountsPage />)

      await waitFor(() =>
        expect(screen.getByTestId('escopo-PJ')).toBeInTheDocument(),
      )
      expect(screen.getByTestId('escopo-PJ')).toHaveClass('inline-flex')
      expect(screen.getByTestId('escopo-PJ')).toHaveTextContent('PJ')
    })

    it('o fecha/vence do cartão é um badge, com o mesmo texto de antes', async () => {
      mockFetch({ ok: true, data: contas, notifications: [] })

      render(<AccountsPage />)

      await waitFor(() =>
        expect(screen.getByTestId('fatura-a2')).toBeInTheDocument(),
      )
      expect(screen.getByTestId('fatura-a2')).toHaveClass('inline-flex')
      expect(screen.getByTestId('fatura-a2')).toHaveTextContent(
        'fecha 25 · vence 05',
      )
    })
  })
})

describe('AccountsPage — alvo de toque do arquivar', () => {
  it('arquivar é alvo de 44px, como os outros destrutivos inline', async () => {
    // Mesma família de `apagar` (extrato) e `Arquivar` (categorias): link
    // destrutivo em linha, medido a 47,2×16 px em Chrome real a 390×844.
    mockRoutes({ initial: contas })
    render(<AccountsPage />)
    const botao = await screen.findByTestId('arquivar-a1')
    expect(botao.className).toContain('min-h-11')
  })

  it('arquivar é empurrado pra outra ponta (ml-auto), longe do "pagar fatura"', async () => {
    // ⚠️ MEDIDO em Chrome real a 390×844 nesta fatia: sozinho na célula (o
    // estado anterior) `arquivar` não tinha vizinho. Com "pagar fatura" ao
    // lado, o `gap-x-4` (16 px) menos o `-mx-2` dos DOIS alvos dava
    // **gap: 0** — as áreas de toque encostando exatamente (pagar terminando
    // em x=119,9, arquivar começando em x=119,9). Com ~34 px de contato, um
    // polegar cobre os dois: um alvo MOVE DINHEIRO e o outro é destrutivo sem
    // desfazer pela interface.
    //
    // É o mesmo defeito (e a mesma correção) já pagos em `#/extrato`, onde
    // `apagar` a 12 px de `editar` fez nascer `ALVO_LINK_FIM`. Depois:
    // **76 px** de separação.
    //
    // ⚠️ A asserção é sobre `ml-auto` E `min-h-11` juntos: `ALVO_LINK` puro
    // também tem `min-h-11`, então checar só a altura passaria com os alvos
    // de volta colados.
    mockRoutes({ initial: contas })
    render(<AccountsPage />)
    const botao = await screen.findByTestId('arquivar-a1')
    expect(botao.className).toContain('ml-auto')
    expect(botao.className).toContain('min-h-11')
    // ⚠️ E NUNCA o `-mx-2` de `ALVO_LINK`: as duas classes sobrevivendo
    // juntas fazem quem vence depender da ordem no CSS emitido, não do
    // código — o achado já medido em `lib/touch.ts`.
    expect(botao.className).not.toContain('-mx-2')
  })
})

describe('AccountsPage — o saldo não se parte em duas linhas', () => {
  it('a célula de saldo é whitespace-nowrap', async () => {
    // ⚠️ MEDIDO em Chrome real a 390×844: `-R$ 2.345,00` quebrava em DUAS
    // caixas de linha — `-R$` (24,6 px) numa, `2.345,00` (61,7 px) na
    // seguinte. O sinal de menos, que é o que distingue "devo" de "tenho",
    // ficava órfão numa linha própria, e um saldo NEGATIVO passava a ser o
    // mais difícil de ler da coluna inteira. Contado por `Range`
    // (`getClientRects().length`), nunca pela altura da `<td>` — a altura da
    // célula é ditada pela linha (a célula vizinha tem o botão de 44 px) e
    // não diz nada sobre o texto quebrar.
    //
    // `tabular-nums` já estava lá e não resolve isto: ele alinha a largura
    // dos dígitos, não impede a quebra entre eles.
    mockRoutes({ initial: contas })
    render(<AccountsPage />)

    const celula = await screen.findByTestId('saldo-a1')
    expect(celula.className).toContain('whitespace-nowrap')
  })
})

describe('AccountsPage — a linguagem: rótulo em versalete, total como manchete', () => {
  it('os cabeçalhos da tabela usam ROTULO (versalete mono), não um font-medium genérico', async () => {
    // O `<th>` é o rótulo do número embaixo dele — é exatamente o papel de
    // `ROTULO` (`lib/tipografia.ts`), a assinatura que o `/admin` já usa.
    // Antes eram `text-left font-medium`, indistinguíveis do corpo.
    mockRoutes({ initial: contas })
    render(<AccountsPage />)

    await screen.findByTestId('grupo-PJ')
    const cabecalho = screen.getAllByRole('columnheader', { name: 'Saldo' })[0]
    expect(cabecalho.className).toContain('font-mono')
    expect(cabecalho.className).toContain('uppercase')
    expect(cabecalho.className).toContain('tracking-[0.18em]')
  })

  it('o total do escopo é MANCHETE (30px), não mais uma linha de rodapé em 14px', async () => {
    // ⚠️ O valor esperado é o MESMO de antes (a soma do escopo); o que muda
    // é o peso: no `<tfoot>` ele saía no mesmo `text-sm` de cada conta
    // somada pra chegar nele.
    mockRoutes({ initial: contas })
    render(<AccountsPage />)

    const total = await screen.findByTestId('total-PJ')
    expect(total).toHaveTextContent('R$ 4.120,00')
    expect(total.className).toContain('text-3xl')
    expect(total.className).toContain('tabular-nums')
  })

  it('PJ e PF continuam JAMAIS somados entre si', async () => {
    mockRoutes({ initial: contas })
    render(<AccountsPage />)
    await screen.findByTestId('total-PJ')

    // 234012 + (-184790) + 412000 = 461222 — o número que não pode existir.
    expect(document.body.textContent).not.toContain('R$ 4.612,22')
    expect(screen.getByTestId('total-PF')).toHaveTextContent('R$ 492,22')
  })
  // -------------------------------------------------------------------------
  // Pagar fatura — o painel mora AQUI (ver o cabeçalho de
  // `blocos/PagarFatura.tsx` pros três candidatos de lugar). Estes testes
  // provam o ponto de entrada; o comportamento do painel é coberto em
  // `blocos/PagarFatura.test.tsx`.
  // -------------------------------------------------------------------------

  it('"pagar fatura" so existe na linha de CARTAO', async () => {
    mockRoutes({ initial: contas })

    render(<AccountsPage />)
    await waitFor(() =>
      expect(screen.getByTestId('grupo-PF')).toBeInTheDocument(),
    )

    // a2 é o cartão; a1 e a3 são contas correntes — conta corrente não tem
    // fatura, e oferecer o link nelas seria oferecer o que não existe.
    expect(screen.getByTestId('pagar-fatura-a2')).toBeInTheDocument()
    expect(screen.queryByTestId('pagar-fatura-a1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pagar-fatura-a3')).not.toBeInTheDocument()
  })

  it('abrir o painel pela linha do cartao carrega a fatura daquele cartao', async () => {
    const usuario = userEvent.setup()
    const fetchMock = mockRoutes({
      initial: contas,
      bills: [{ competence: '2026-08', amount_cents: 184790, line_count: 40 }],
    })

    render(<AccountsPage />)
    await waitFor(() =>
      expect(screen.getByTestId('grupo-PF')).toBeInTheDocument(),
    )
    await usuario.click(screen.getByTestId('pagar-fatura-a2'))

    // O painel recebe `accounts` e `carregar` do pai: o saldo da conta de
    // ORIGEM (requisito da tela) já veio no MESMO GET /api/accounts, sem
    // requisição a mais.
    await waitFor(() =>
      expect(screen.getByTestId('fatura-total-valor')).toHaveTextContent(
        'R$ 1.847,90',
      ),
    )
    expect(screen.getByTestId('fatura-linhas')).toHaveTextContent(
      '40 lançamentos serão liquidados',
    )
    expect(
      within(screen.getByTestId('fatura-origem')).getByRole('option', {
        name: 'Nubank · R$ 2.340,12',
      }),
    ).toBeInTheDocument()

    expect(
      fetchMock.mock.calls.some(([path]) =>
        (path as string).startsWith('/api/bills?card_account_id=a2'),
      ),
    ).toBe(true)
  })
})
