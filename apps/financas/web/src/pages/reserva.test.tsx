import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ReservaPage } from './reserva'

// Mockar `api` (não a rede) — mesmo padrão de config.test.tsx/
// recorrentes.test.tsx: `api` já traduz envelope/erro, testar aqui prova o
// COMPONENTE, não o transporte HTTP.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
})

const statusVazio = {
  saldo_cents: 0,
  meta_cents: { min: 0, max: 0 },
  meses: null,
  contas: [],
  goal_months: 3,
}

const contasFixture = [
  {
    id: 'a1',
    name: 'Nubank PJ',
    scope: 'PJ',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 100000,
  },
  {
    id: 'a2',
    name: 'Caixinha PF',
    scope: 'PF',
    kind: 'savings',
    closing_day: null,
    due_day: null,
    balance_cents: 50000,
  },
]

/** Roteia `api()` mockado por (método, path) — mesmo padrão das outras telas. */
function mockApi(
  opts: {
    reserve?: () => unknown
    accounts?: () => unknown
    put?: (body: { account_ids: string[] }) => unknown
  } = {},
) {
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && path.startsWith('/api/reserve')) {
        return opts.reserve ? opts.reserve() : statusVazio
      }
      if (method === 'GET' && path === '/api/accounts') {
        return opts.accounts ? opts.accounts() : contasFixture
      }
      if (method === 'PUT' && path === '/api/reserve/accounts') {
        const body = init?.body
          ? (JSON.parse(String(init.body)) as { account_ids: string[] })
          : { account_ids: [] }
        return opts.put ? opts.put(body) : { account_ids: body.account_ids }
      }
      throw new Error(`chamada inesperada: ${method} ${path}`)
    },
  )
}

describe('ReservaPage', () => {
  it('1. mostra saldo, meta e meses como faixa', async () => {
    mockApi({
      reserve: () => ({
        saldo_cents: 150000,
        meta_cents: { min: 100000, max: 300000 },
        meses: { min: 2.1, max: 4.8 },
        contas: ['a1'],
        goal_months: 3,
      }),
    })

    render(<ReservaPage />)

    expect(
      await screen.findByRole('heading', { name: 'Reserva de emergência' }),
    ).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 1.500,00'),
    )
    expect(screen.getByTestId('meta')).toHaveTextContent(
      'R$ 1.000,00 a R$ 3.000,00',
    )
    expect(screen.getByTestId('meses')).toHaveTextContent(
      'entre 2,1 e 4,8 meses',
    )
  })

  describe('2. alerta pelo PISO, nunca pelo teto (espelho do limiar do Comprometido)', () => {
    it('piso abaixo da meta e teto acima ⇒ alerta visível', async () => {
      mockApi({
        reserve: () => ({
          saldo_cents: 60000,
          meta_cents: { min: 60000, max: 240000 },
          meses: { min: 2, max: 5 },
          contas: ['a1'],
          goal_months: 3,
        }),
      })

      render(<ReservaPage />)

      await waitFor(() =>
        expect(screen.getByTestId('meses')).toHaveTextContent(
          'entre 2,0 e 5,0 meses',
        ),
      )
      expect(screen.getByRole('alert')).toHaveTextContent(/abaixo/i)
    })

    it('piso na meta ou acima ⇒ SEM alerta, mesmo com faixa aberta', async () => {
      mockApi({
        reserve: () => ({
          saldo_cents: 300000,
          meta_cents: { min: 60000, max: 240000 },
          meses: { min: 4, max: 6 },
          contas: ['a1'],
          goal_months: 3,
        }),
      })

      render(<ReservaPage />)

      await waitFor(() =>
        expect(screen.getByTestId('meses')).toHaveTextContent(
          'entre 4,0 e 6,0 meses',
        ),
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('3. meses: null ⇒ explica que falta cadastrar custo fixo, com link pra Recorrentes', async () => {
    mockApi({
      reserve: () => ({
        ...statusVazio,
        saldo_cents: 100000,
        contas: ['a1'],
      }),
    })

    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByTestId('sem-custo-fixo')).toBeInTheDocument(),
    )
    const link = screen.getByRole('link', { name: /recorrentes/i })
    expect(link).toHaveAttribute('href', '#/recorrentes')
    // Nunca "infinito" nem "0 meses" — as duas mentiras que a tela tem que
    // evitar quando a verdade é "nada foi cadastrado ainda".
    expect(screen.queryByText(/infinito/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('meses')).not.toBeInTheDocument()
  })

  it('4. nenhuma conta designada ⇒ explica o que fazer', async () => {
    mockApi({
      reserve: () => ({
        ...statusVazio,
        meses: { min: 2, max: 5 },
        contas: [],
      }),
    })

    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByTestId('sem-conta-designada')).toBeInTheDocument(),
    )
  })

  it('nenhuma conta CADASTRADA (não só não designada) ⇒ explica e linka pra Contas', async () => {
    mockApi({
      reserve: () => statusVazio,
      accounts: () => [],
    })

    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByText(/nenhuma conta cadastrada/i)).toBeInTheDocument(),
    )
    const link = screen.getByRole('link', { name: /criar conta/i })
    expect(link).toHaveAttribute('href', '#/contas')
  })

  it('5. designar conta e ver o saldo mudar', async () => {
    let designadas: string[] = []
    mockApi({
      reserve: () => ({
        ...statusVazio,
        saldo_cents: designadas.includes('a1') ? 100000 : 0,
        contas: designadas,
      }),
      put: (body) => {
        designadas = body.account_ids
        return { account_ids: body.account_ids }
      },
    })

    const user = userEvent.setup()
    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 0,00'),
    )

    await user.click(screen.getByLabelText(/Nubank PJ/))
    await user.click(
      screen.getByRole('button', { name: 'Salvar contas designadas' }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 1.000,00'),
    )
    expect(api).toHaveBeenCalledWith(
      '/api/reserve/accounts',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ account_ids: ['a1'] }),
      }),
    )
  })

  it('erro ao carregar mostra role="alert", sem renderizar o resto da tela', async () => {
    vi.mocked(api).mockRejectedValue(new Error('sem conexão'))

    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('sem conexão'),
    )
  })

  it('ajuda: explica por que a reserva vem antes de ativo que deprecia', async () => {
    mockApi({ reserve: () => statusVazio })
    const user = userEvent.setup()

    render(<ReservaPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Reserva de emergência' }),
      ).toBeInTheDocument(),
    )

    const gatilho = screen.getByRole('button', {
      name: /Ajuda sobre Reserva de emergência/i,
    })
    expect(screen.queryByText(/deprecia/i)).not.toBeInTheDocument()

    await user.click(gatilho)

    expect(await screen.findByText(/deprecia/i)).toBeInTheDocument()
  })
})
