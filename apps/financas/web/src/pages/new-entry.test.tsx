import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function mockRoutes(post?: unknown) {
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
})
