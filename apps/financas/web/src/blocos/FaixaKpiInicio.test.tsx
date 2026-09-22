import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { limparRequisicoesEmVoo } from '../lib/em-voo'
import { FaixaKpiInicio } from './FaixaKpiInicio'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const comprometido = {
  competences: ['2026-09'],
  rows: [],
  totals: [{ min: 180000, max: 245000 }],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [{ min: 50, max: 68 }],
}

const numeros = {
  competence: '2026-09',
  previous_competence: '2026-08',
  top_categories: [],
  total_cents: -341280,
  total_pf_cents: -341280,
  total_pj_cents: 0,
  previous_total_cents: -307280,
  variation_cents: 34000,
  variation_pct: 11,
  variation_pf_cents: 34000,
  variation_pf_pct: 11,
  biggest_increase: null,
}

const dividas = [
  {
    id: 'd1',
    title: 'Pai',
    payee_name: 'Pai',
    total_cents: 450000,
    paid_cents: 270000,
    remaining_cents: 180000,
  },
  {
    id: 'd2',
    title: 'Tio',
    payee_name: 'Tio',
    total_cents: 300000,
    paid_cents: 60000,
    remaining_cents: 240000,
  },
]

const reserva = {
  saldo_cents: 677840,
  meta_cents: { min: 600000, max: 780000 },
  meses: { min: 2.6, max: 3.3 },
  contas: [],
  goal_months: 6,
}

function mockRotas(over: Record<string, unknown> = {}) {
  vi.mocked(api).mockImplementation((path: string) => {
    if (path.startsWith('/api/reports/commitments'))
      return Promise.resolve(over.comprometido ?? comprometido)
    if (path.startsWith('/api/insights/numbers'))
      return Promise.resolve(over.numeros ?? numeros)
    if (path.startsWith('/api/debts'))
      return Promise.resolve(over.dividas ?? dividas)
    if (path.startsWith('/api/reserve'))
      return Promise.resolve(over.reserva ?? reserva)
    return Promise.reject(new Error(`rota inesperada em teste: ${path}`))
  })
}

afterEach(() => {
  limparRequisicoesEmVoo()
  vi.clearAllMocks()
})

describe('FaixaKpiInicio', () => {
  it('mostra os quatro números da régua', async () => {
    mockRotas()

    render(<FaixaKpiInicio />)

    await waitFor(() =>
      expect(screen.getByTestId('kpi-comprometido-valor')).toHaveTextContent(
        '50% a 68%',
      ),
    )
    expect(screen.getByTestId('kpi-gasto-valor')).toHaveTextContent(
      'R$ 3.412,80',
    )
    // 180000 + 240000
    expect(screen.getByTestId('kpi-devo-valor')).toHaveTextContent(
      'R$ 4.200,00',
    )
    expect(screen.getByTestId('kpi-reserva-valor')).toHaveTextContent(
      'entre 2,6 e 3,3 meses',
    )
  })

  // ⚠️ A INVERSÃO entre os dois alertas, lado a lado na mesma faixa: o
  // Comprometido alerta pelo TETO (gasto máximo), a Reserva pelo PISO
  // (sobrevivência mínima). Trocar os dois compila e roda, e devolve
  // exatamente o número otimista no cenário ruim.
  it('Comprometido alerta pelo TETO; Reserva alerta pelo PISO', async () => {
    mockRotas({
      // piso 40% (abaixo do limiar), teto 68% (acima) ⇒ alerta
      comprometido: {
        ...comprometido,
        pct_of_fixed_net: [{ min: 40, max: 68 }],
      },
      // piso 2,6 meses contra meta de 6 ⇒ alerta
      reserva,
    })

    render(<FaixaKpiInicio />)

    await waitFor(() =>
      expect(screen.getByTestId('kpi-comprometido-valor')).toHaveClass(
        'text-destructive',
      ),
    )
    expect(screen.getByTestId('kpi-reserva-valor')).toHaveClass(
      'text-destructive',
    )
  })

  it('dentro do limiar e com a meta batida, nenhum cartão fica em alerta', async () => {
    mockRotas({
      comprometido: {
        ...comprometido,
        pct_of_fixed_net: [{ min: 10, max: 22 }],
      },
      reserva: { ...reserva, meses: { min: 7, max: 9 }, goal_months: 6 },
    })

    render(<FaixaKpiInicio />)

    await waitFor(() =>
      expect(screen.getByTestId('kpi-comprometido-valor')).toHaveTextContent(
        '10% a 22%',
      ),
    )
    expect(screen.getByTestId('kpi-comprometido-valor')).not.toHaveClass(
      'text-destructive',
    )
    expect(screen.getByTestId('kpi-reserva-valor')).not.toHaveClass(
      'text-destructive',
    )
  })

  // ⚠️ O ponto mais consequente desta faixa: ela é uma RÉGUA, não um dono de
  // rota. Cada bloco da home já mostra o próprio erro no próprio card — um
  // alerta daqui seria a mesma notícia duas vezes, e `home.test.tsx` conta
  // os alertas da tela inteira justamente pra travar isso.
  it('TODAS as rotas falhando: nenhum role="alert" sai daqui — degrada em silêncio', async () => {
    vi.mocked(api).mockRejectedValue(new Error('caiu'))

    render(<FaixaKpiInicio />)

    await waitFor(() =>
      expect(screen.getByTestId('kpi-comprometido-valor')).toHaveTextContent(
        '—',
      ),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('kpi-devo-valor')).toHaveTextContent('—')
    expect(screen.getByTestId('kpi-reserva-valor')).toHaveTextContent('—')
  })

  it('uma rota falhando não apaga os outros três números', async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.startsWith('/api/reserve'))
        return Promise.reject(new Error('reserva caiu'))
      if (path.startsWith('/api/reports/commitments'))
        return Promise.resolve(comprometido)
      if (path.startsWith('/api/insights/numbers'))
        return Promise.resolve(numeros)
      if (path.startsWith('/api/debts')) return Promise.resolve(dividas)
      return Promise.reject(new Error(`rota inesperada em teste: ${path}`))
    })

    render(<FaixaKpiInicio />)

    await waitFor(() =>
      expect(screen.getByTestId('kpi-reserva-valor')).toHaveTextContent('—'),
    )
    expect(screen.getByTestId('kpi-devo-valor')).toHaveTextContent(
      'R$ 4.200,00',
    )
    expect(screen.getByTestId('kpi-gasto-valor')).toHaveTextContent(
      'R$ 3.412,80',
    )
  })

  // ⚠️ Gastar MENOS não pode ficar verde (protanopia/deuteranopia preservam
  // o azul, não o verde) — o sinal é o "−" e as palavras.
  it('gastou mais tinge de --destructive; gastou menos fica no neutro, nunca verde', async () => {
    mockRotas()
    const { unmount } = render(<FaixaKpiInicio />)
    await waitFor(() =>
      expect(screen.getByTestId('kpi-gasto-variacao')).toHaveTextContent(
        '+R$ 340,00 (+11%) a mais que ago/26',
      ),
    )
    expect(screen.getByTestId('kpi-gasto-variacao')).toHaveClass(
      'text-destructive',
    )
    unmount()
    limparRequisicoesEmVoo()

    mockRotas({
      numeros: {
        ...numeros,
        variation_cents: -34000,
        variation_pct: -11,
        variation_pf_cents: -34000,
        variation_pf_pct: -11,
      },
    })
    render(<FaixaKpiInicio />)
    const menos = await screen.findByTestId('kpi-gasto-variacao')
    expect(menos).toHaveTextContent('−R$ 340,00 (−11%) a menos que ago/26')
    expect(menos.className).not.toMatch(/green|emerald|success|lime|teal/i)
    expect(menos).not.toHaveClass('text-destructive')
  })

  // `meses: null` é o estado real de produção sem recorrente cadastrada —
  // não é "reserva zero", é "não dá pra calcular", e alerta nenhum sai daí.
  it('sem custo fixo cadastrado (meses null): diz que não dá pra calcular, sem alerta', async () => {
    mockRotas({ reserva: { ...reserva, meses: null } })

    render(<FaixaKpiInicio />)

    await waitFor(() =>
      expect(
        screen.getByText('sem custo fixo cadastrado — não dá pra calcular'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('kpi-reserva-valor')).not.toHaveClass(
      'text-destructive',
    )
  })
})

// ---------------------------------------------------------------------
// PJ/PF — o KPI mostrava PJ+PF somados, e uma transferencia PJ->PF
// importada aparecia como gasto. Ver CLAUDE.md, "Transferencia vinda do
// import" e "PJ/PF: a conta e o default, a linha e a verdade".
// ---------------------------------------------------------------------

describe('escopo PJ/PF no KPI de gasto', () => {
  const misto = {
    ...numeros,
    total_cents: -1123469,
    total_pf_cents: -693469,
    total_pj_cents: -430000,
    variation_cents: 100000,
    variation_pct: 10,
    variation_pf_cents: -20000,
    variation_pf_pct: -3,
  }

  it('mostra o gasto PESSOAL, nao a soma com a PJ', async () => {
    mockRotas({ numeros: misto })
    render(<FaixaKpiInicio />)
    await waitFor(() =>
      expect(screen.getByTestId('kpi-gasto-valor')).toHaveTextContent(
        'R$ 6.934,69',
      ),
    )
  })

  it('a variacao acompanha o valor mostrado (PF), nao a combinada', async () => {
    mockRotas({ numeros: misto })
    render(<FaixaKpiInicio />)
    await waitFor(() =>
      expect(screen.getByTestId('kpi-gasto-variacao')).toHaveTextContent(
        'a menos',
      ),
    )
    expect(screen.getByTestId('kpi-gasto-variacao')).toHaveTextContent('3%')
  })

  it('declara a PJ separado quando ela teve gasto', async () => {
    mockRotas({ numeros: misto })
    render(<FaixaKpiInicio />)
    await waitFor(() =>
      expect(screen.getByTestId('kpi-gasto-pj')).toHaveTextContent(
        'R$ 4.300,00',
      ),
    )
  })

  it('nao polui o card quando a PJ nao gastou nada no mes', async () => {
    mockRotas({ numeros: { ...misto, total_pj_cents: 0 } })
    render(<FaixaKpiInicio />)
    await waitFor(() =>
      expect(screen.getByTestId('kpi-gasto-valor')).toHaveTextContent(
        'R$ 6.934,69',
      ),
    )
    expect(screen.queryByTestId('kpi-gasto-pj')).toBeNull()
  })
})
