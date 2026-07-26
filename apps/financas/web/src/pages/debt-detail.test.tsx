import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DebtDetailPage, validateAllocations } from './debt-detail'

const items = [
  {
    item_id: 'i1',
    debt_id: 'd1',
    description: 'MacBook Air',
    amount_cents: 450000,
    allocated_cents: 450000,
    remaining_cents: 0,
    is_settled: 1,
  },
  {
    item_id: 'i2',
    debt_id: 'd1',
    description: 'Steam Deck',
    amount_cents: 280000,
    allocated_cents: 144000,
    remaining_cents: 136000,
    is_settled: 0,
  },
]

const detail = {
  debt: {
    id: 'd1',
    payee_id: 'p1',
    direction: 'i_owe',
    title: 'Pai',
    currency: 'BRL',
    opened_at: '2026-03-01',
    status: 'open',
    settled_at: null,
    notes: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  items,
  payments: [
    {
      id: 'pg1',
      debt_id: 'd1',
      paid_on: '2026-05-10',
      amount_cents: 294000,
      kind: 'cash',
      transaction_id: 'tx1',
      notes: null,
      created_at: '2026-05-10T00:00:00Z',
      allocations: [
        { item_id: 'i1', amount_cents: 150000 },
        { item_id: 'i2', amount_cents: 144000 },
      ],
    },
  ],
}

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
]

function ok(data: unknown, status = 200) {
  return { status, json: async () => ({ ok: true, data, notifications: [] }) }
}

function fail(status: number, code: string, message: string) {
  return {
    status,
    json: async () => ({
      ok: false,
      data: null,
      notifications: [{ type: 'error', code, message }],
    }),
  }
}

/** Responde por rota, na ordem em que a tela chama. */
function mockRoutes(post?: unknown) {
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return post ?? ok({ payment: {}, transaction: null }, 201)
    if (path.startsWith('/api/accounts')) return ok(contas)
    if (path.startsWith('/api/debts/')) return ok(detail)
    throw new Error(`rota nao mockada: ${path}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validateAllocations', () => {
  it('aceita alocacao que fecha exatamente no teto do item', () => {
    expect(
      validateAllocations({
        total_cents: 136000,
        items,
        alloc: { i2: 136000 },
      }),
    ).toBeNull()
  })

  it('recusa valor de pagamento zerado', () => {
    expect(validateAllocations({ total_cents: 0, items, alloc: {} })).toMatch(
      /maior que zero/,
    )
  })

  it('recusa soma de alocacoes acima do valor do pagamento', () => {
    expect(
      validateAllocations({ total_cents: 50000, items, alloc: { i2: 60000 } }),
    ).toMatch(/valor do pagamento/)
  })

  it('recusa alocacao acima do saldo do item', () => {
    expect(
      validateAllocations({
        total_cents: 300000,
        items,
        alloc: { i2: 200000 },
      }),
    ).toMatch(/Steam Deck/)
  })

  it('recusa alocacao em item ja quitado', () => {
    expect(
      validateAllocations({ total_cents: 10000, items, alloc: { i1: 10000 } }),
    ).toMatch(/MacBook Air/)
  })

  it('aceita alocacao parcial (sobra sem alocar)', () => {
    expect(
      validateAllocations({
        total_cents: 200000,
        items,
        alloc: { i2: 136000 },
      }),
    ).toBeNull()
  })
})

describe('DebtDetailPage', () => {
  it('mostra itens com total/pago/falta e marca o quitado', async () => {
    mockRoutes()

    render(<DebtDetailPage debtId="d1" />)

    await waitFor(() =>
      expect(screen.getByTestId('item-i1')).toBeInTheDocument(),
    )

    const macbook = within(screen.getByTestId('item-i1'))
    expect(macbook.getByTestId('item-i1-total')).toHaveTextContent(
      'R$ 4.500,00',
    )
    expect(macbook.getByTestId('item-i1-pago')).toHaveTextContent('R$ 4.500,00')
    expect(macbook.getByTestId('item-i1-falta')).toHaveTextContent('R$ 0,00')
    expect(screen.getByTestId('item-i1')).toHaveClass('quitado')

    const steam = within(screen.getByTestId('item-i2'))
    expect(steam.getByTestId('item-i2-falta')).toHaveTextContent('R$ 1.360,00')
    expect(screen.getByTestId('item-i2')).not.toHaveClass('quitado')
  })

  it('lista pagamentos com a alocacao de cada um por item', async () => {
    mockRoutes()

    render(<DebtDetailPage debtId="d1" />)

    await waitFor(() =>
      expect(screen.getByTestId('pagamento-pg1')).toBeInTheDocument(),
    )

    const pg = within(screen.getByTestId('pagamento-pg1'))
    expect(pg.getByText('10/05/2026')).toBeInTheDocument()
    expect(pg.getByTestId('pagamento-pg1-total')).toHaveTextContent(
      'R$ 2.940,00',
    )
    expect(pg.getByTestId('alloc-pg1-i1')).toHaveTextContent('MacBook Air')
    expect(pg.getByTestId('alloc-pg1-i1')).toHaveTextContent('R$ 1.500,00')
    expect(pg.getByTestId('alloc-pg1-i2')).toHaveTextContent('R$ 1.440,00')
  })

  it('barra a superalocacao no cliente e NAO chama a API', async () => {
    const fetchMock = mockRoutes()

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '500,00' },
    })
    fireEvent.change(screen.getByLabelText('Steam Deck'), {
      target: { value: '900,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/valor do pagamento/),
    )
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('envia o pagamento dividido entre itens quando o guard passa', async () => {
    const fetchMock = mockRoutes()

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-08-05' },
    })
    fireEvent.change(screen.getByLabelText('Steam Deck'), {
      target: { value: '1.360,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(post![0]).toBe('/api/debts/d1/payments')
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({
        paid_on: '2026-08-05',
        amount_cents: 136000,
        kind: 'cash',
        account_id: 'a1',
        description: 'Pgto divida — Pai',
        allocations: [{ item_id: 'i2', amount_cents: 136000 }],
      })
    })
  })

  it('mostra o OverAllocationError vindo da API mesmo com o guard do cliente ok', async () => {
    // O trigger do D1 é a verdade: o cliente pode estar com dado velho.
    mockRoutes(fail(409, 'over_allocation', 'alocacao excede o valor do item'))

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(screen.getByLabelText('Steam Deck'), {
      target: { value: '1.360,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'O banco recusou: alocacao excede o valor do item. Nada foi gravado — recarregue a divida.',
      ),
    )
  })

  it('descarta resposta obsoleta quando debtId muda antes dela chegar', async () => {
    // A troca de divida no App (App.tsx) so troca a prop debtId — nao
    // desmonta o componente. Uma resposta lenta da divida antiga chegando
    // DEPOIS da nova nao pode sobrescrever a tela que o usuario ja navegou.
    const detailD2 = {
      debt: { ...detail.debt, id: 'd2', title: 'Banco' },
      items: [
        {
          item_id: 'j1',
          debt_id: 'd2',
          description: 'Cadeira',
          amount_cents: 100000,
          allocated_cents: 0,
          remaining_cents: 100000,
          is_settled: 0,
        },
      ],
      payments: [],
    }

    let resolveD1: (value: unknown) => void = () => {}
    const d1Pending = new Promise((resolve) => {
      resolveD1 = resolve
    })

    const fn = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return ok({ payment: {}, transaction: null }, 201)
      if (path.startsWith('/api/accounts')) return ok(contas)
      if (path === '/api/debts/d1') return d1Pending
      if (path === '/api/debts/d2') return ok(detailD2)
      throw new Error(`rota nao mockada: ${path}`)
    })
    vi.stubGlobal('fetch', fn)

    const { rerender } = render(<DebtDetailPage debtId="d1" />)

    rerender(<DebtDetailPage debtId="d2" />)

    await waitFor(() =>
      expect(screen.getByTestId('item-j1')).toBeInTheDocument(),
    )

    // A resposta atrasada de d1 chega só agora — depois que a tela já
    // mostra d2. Sem a guarda de unmount/stale, isso reescreveria o estado.
    await act(async () => {
      resolveD1(ok(detail))
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(screen.queryByTestId('item-i1')).not.toBeInTheDocument()
    expect(screen.getByTestId('item-j1')).toBeInTheDocument()
  })
})
