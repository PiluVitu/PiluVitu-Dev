import { render, screen, waitFor, within } from '@testing-library/react'
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
})
