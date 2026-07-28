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
 */
function mockRoutes(opts: {
  initial: unknown[]
  depois?: unknown[]
  post?: { status: number; body: unknown }
}) {
  let getCount = 0
  const fn = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const post = opts.post ?? {
        status: 201,
        body: { ok: true, data: { id: 'nova' }, notifications: [] },
      }
      return { status: post.status, json: async () => post.body }
    }
    getCount++
    const data = getCount === 1 ? opts.initial : (opts.depois ?? opts.initial)
    return {
      status: 200,
      json: async () => ({ ok: true, data, notifications: [] }),
    }
  })
  vi.stubGlobal('fetch', fn)
  return fn
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
})
