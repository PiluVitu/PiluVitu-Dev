import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewEntryPage } from './new-entry'

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
]

const recorrentes = [
  {
    id: 'r1',
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
    id: 'r2',
    description: 'DAS',
    category_id: null,
    account_id: null,
    scope: 'PJ',
    day_of_month: 20,
    amount_min_cents: 1200,
    amount_max_cents: 60000,
    starts_on: '2026-01-01',
    ends_on: null,
    active: 1,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'r3',
    description: 'Ferramenta pausada',
    category_id: null,
    account_id: null,
    scope: 'PJ',
    day_of_month: 1,
    amount_min_cents: 5000,
    amount_max_cents: 5000,
    starts_on: '2026-01-01',
    ends_on: null,
    active: 0,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

function mockRoutes(post?: unknown, recs: unknown = recorrentes) {
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return (
        post ?? {
          status: 201,
          json: async () => ({
            ok: true,
            data: { id: 'novo' },
            notifications: [],
          }),
        }
      )
    }
    if (path.startsWith('/api/accounts')) {
      return {
        status: 200,
        json: async () => ({ ok: true, data: contas, notifications: [] }),
      }
    }
    if (path.startsWith('/api/recurring')) {
      return {
        status: 200,
        json: async () => ({ ok: true, data: recs, notifications: [] }),
      }
    }
    throw new Error(`rota nao mockada: ${path}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function postBody(fetchMock: ReturnType<typeof mockRoutes>) {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit)?.method === 'POST',
  )
  return {
    path: call![0] as string,
    body: JSON.parse((call![1] as RequestInit).body as string),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NewEntryPage', () => {
  it('lanca uma saida simples com valor negativo em centavos', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Mercado' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a1' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { path, body } = postBody(fetchMock)
      expect(path).toBe('/api/transactions')
      expect(body).toEqual({
        account_id: 'a1',
        amount_cents: -136000,
        purchase_date: '2026-07-28',
        description: 'Mercado',
        is_business: 0,
      })
    })
  })

  it('o toggle PJ marca is_business = 1', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Contador' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '275,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-05' },
    })
    fireEvent.click(screen.getByLabelText('PJ'))
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => expect(postBody(fetchMock).body.is_business).toBe(1))
  })

  it('entrada manda valor positivo', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Freela' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '2.000,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-15' },
    })
    fireEvent.click(screen.getByLabelText('Entrada'))
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(postBody(fetchMock).body.amount_cents).toBe(200000),
    )
  })

  // Task 7 da fatia ⑥ (docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md
  // §3.1): a tela Lancar oferece "este lancamento e o Starlink de agosto".
  it('o select Recorrente lista so as ativas — a pausada nao aparece', async () => {
    mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Recorrente')).toBeInTheDocument(),
    )

    const select = screen.getByLabelText('Recorrente') as HTMLSelectElement
    const rotulos = Array.from(select.options).map((o) => o.textContent)
    expect(rotulos).toContain('— nenhuma —')
    expect(rotulos.some((r) => r?.startsWith('Starlink'))).toBe(true)
    expect(rotulos.some((r) => r?.startsWith('DAS'))).toBe(true)
    expect(rotulos.some((r) => r?.includes('Ferramenta pausada'))).toBe(false)
  })

  it('escolher uma recorrente manda recurring_expense_id no POST /api/transactions', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Recorrente')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Starlink de agosto' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '189,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-08-10' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a1' },
    })
    fireEvent.change(screen.getByLabelText('Recorrente'), {
      target: { value: 'r1' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { path, body } = postBody(fetchMock)
      expect(path).toBe('/api/transactions')
      expect(body.recurring_expense_id).toBe('r1')
    })
  })

  it('sem escolher recorrente, a chave recurring_expense_id nao vai no corpo', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Recorrente')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Mercado' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '50,00' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a1' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { body } = postBody(fetchMock)
      expect('recurring_expense_id' in body).toBe(false)
    })
  })

  it('modo parcelado esconde o select Recorrente', async () => {
    mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Recorrente')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByLabelText('Parcelado'))
    expect(screen.queryByLabelText('Recorrente')).not.toBeInTheDocument()
  })

  it('modo parcelado chama POST /api/installment-plans com o total positivo', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Geladeira' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.000,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a2' },
    })
    fireEvent.click(screen.getByLabelText('Parcelado'))
    fireEvent.change(screen.getByLabelText('Parcelas'), {
      target: { value: '3' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { path, body } = postBody(fetchMock)
      expect(path).toBe('/api/installment-plans')
      expect(body).toEqual({
        account_id: 'a2',
        description: 'Geladeira',
        total_cents: 100000,
        installments_count: 3,
        purchase_date: '2026-07-28',
        is_business: 0,
      })
    })
  })

  it('mostra a previa das parcelas com o resto nas primeiras', async () => {
    mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '100,00' },
    })
    fireEvent.click(screen.getByLabelText('Parcelado'))
    fireEvent.change(screen.getByLabelText('Parcelas'), {
      target: { value: '3' },
    })

    expect(screen.getByTestId('previa-parcelas')).toHaveTextContent(
      '3× de R$ 33,34 / R$ 33,33 / R$ 33,33',
    )
  })

  it('recusa valor invalido sem chamar a API', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Erro' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: 'abc' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Valor inválido'),
    )
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('sem Data preenchida, usa o dia de Teresina (nao UTC) como default', async () => {
    // 01:00 UTC de 01/08 e 22h de 31/07 em Teresina (UTC-3). new Date().
    // toISOString().slice(0,10) gravaria '2026-08-01' — um dia adiantado.
    // Fake só o Date (nao os timers): waitFor usa setTimeout de verdade por
    // baixo, e travaria se o relogio inteiro estivesse congelado.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T01:00:00Z'))
    try {
      const fetchMock = mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Tarde da noite' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '50,00' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      await waitFor(() =>
        expect(postBody(fetchMock).body.purchase_date).toBe('2026-07-31'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('mostra o erro da API no submit', async () => {
    mockRoutes({
      status: 422,
      json: async () => ({
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'invalid_account',
            message: 'cartao sem dia de fechamento',
          },
        ],
      }),
    })

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'X' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '10,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'cartao sem dia de fechamento',
      ),
    )
  })

  // Task 5 (ajuda contextual, §3.2 do spec): "Lançar" tem dois pontos —
  // Competência (ao lado de Data) e PJ/PF (ao lado do toggle PJ, também em
  // "Lançar / Contas"). Clique, não hover — mesmo motivo do resto da task.
  it('ajuda: "Competência" (ao lado de Data) abre no clique com o texto do fechamento da fatura', async () => {
    mockRoutes()
    const user = userEvent.setup()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Competência' }),
    )
    expect(await screen.findByText(/fatura fecha/)).toBeInTheDocument()
  })

  it('ajuda: "PJ / PF" (ao lado do toggle PJ) abre no clique', async () => {
    mockRoutes()
    const user = userEvent.setup()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre PJ / PF' }),
    )
    expect(
      await screen.findByText(/dá para pagar algo PF pelo cartão PJ/),
    ).toBeInTheDocument()
    // O checkbox continua endereçável por label depois do ajuste de markup
    // (Ajuda foi movido pra FORA do <label>, nunca dentro).
    expect(screen.getByLabelText('PJ')).toBeInTheDocument()
  })
})
