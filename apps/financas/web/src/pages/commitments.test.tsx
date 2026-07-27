import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommitmentsPage } from './commitments'

const report = {
  competences: [
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
  ],
  rows: [
    {
      account_id: 'debt:d1',
      account_name: 'Divida — Pai',
      cells: [50000, 50000, 36000, 0, 0, 0],
    },
    {
      account_id: 'a2',
      account_name: 'Inter cartao',
      cells: [42000, 42000, 42000, 42000, 0, 0],
    },
    {
      account_id: 'a1',
      account_name: 'Nubank cartao',
      cells: [124000, 124000, 124000, 89000, 89000, 89000],
    },
  ],
  totals: [216000, 216000, 202000, 131000, 89000, 89000],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [60, 60, 56, 36, 25, 25],
}

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CommitmentsPage', () => {
  it('pede 6 competencias e monta a matriz competencia x conta', async () => {
    const fetchMock = mockFetch({ ok: true, data: report, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-a1')).toBeInTheDocument(),
    )

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/reports/commitments?from=2026-08&months=6',
    )

    const cabecalho = within(screen.getByTestId('cabecalho'))
    expect(cabecalho.getByText('ago/26')).toBeInTheDocument()
    expect(cabecalho.getByText('jan/27')).toBeInTheDocument()

    const nubank = within(screen.getByTestId('linha-a1'))
    expect(nubank.getByTestId('celula-a1-0')).toHaveTextContent('R$ 1.240,00')
    expect(nubank.getByTestId('celula-a1-3')).toHaveTextContent('R$ 890,00')
  })

  it('mostra TOTAL e % do liquido fixo', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('total-0')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('total-0')).toHaveTextContent('R$ 2.160,00')
    expect(screen.getByTestId('pct-0')).toHaveTextContent('60%')
    expect(screen.getByTestId('pct-4')).toHaveTextContent('25%')
    expect(screen.getByTestId('denominador')).toHaveTextContent('R$ 3.600,00')
  })

  it('destaca em vermelho so o que passa de 50%', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() => expect(screen.getByTestId('pct-0')).toBeInTheDocument())
    expect(screen.getByTestId('pct-0')).toHaveClass('alerta') // 60%
    expect(screen.getByTestId('pct-2')).toHaveClass('alerta') // 56%
    expect(screen.getByTestId('pct-3')).not.toHaveClass('alerta') // 36%
    expect(screen.getByTestId('pct-5')).not.toHaveClass('alerta') // 25%
  })

  it('mostra estado vazio quando nao ha comprometimento', async () => {
    mockFetch({
      ok: true,
      data: {
        ...report,
        rows: [],
        totals: [0, 0, 0, 0, 0, 0],
        pct_of_fixed_net: [0, 0, 0, 0, 0, 0],
      },
      notifications: [],
    })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(
        screen.getByText('Nenhuma parcela ou dívida em aberto na janela.'),
      ).toBeInTheDocument(),
    )
  })

  // Task 10: fixed_net_cents deixou de ser sempre 360000 — agora pode vir de
  // um valor SALVO em settings (o backend resolve isso em GET
  // /api/reports/commitments; esta página não muda como chama a rota). Este
  // teste prova que a tela cheia (não só o bloco da home) reflete o que a
  // API devolveu, não um "R$ 3.600,00" fixo no componente.
  it('Task 10: denominador e % refletem o fixed_net_cents que a API devolveu, não um valor fixo', async () => {
    const reportComOutraRenda = {
      ...report,
      fixed_net_cents: 200000,
      pct_of_fixed_net: [108, 108, 101, 65, 44, 44],
    }
    mockFetch({ ok: true, data: reportComOutraRenda, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('denominador')).toHaveTextContent(
        'R$ 2.000,00',
      ),
    )
    expect(screen.getByTestId('pct-0')).toHaveTextContent('108%')
  })

  it('mostra o erro da API', async () => {
    mockFetch(
      {
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'invalid_query',
            message: 'competencia invalida: 2026-8',
          },
        ],
      },
      400,
    )

    render(<CommitmentsPage from="2026-8" />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'competencia invalida',
      ),
    )
  })
})
