import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  // Task 6 (fatia ⑥): totals/pct_of_fixed_net viraram FAIXA {min,max}. Este
  // fixture é todo DEGENERADO (min === max) de propósito — é o caso comum
  // (nenhuma recorrente em faixa cadastrada nestas competências) e mantém
  // os valores/asserções idênticos aos de antes da Task 3.
  totals: [
    { min: 216000, max: 216000 },
    { min: 216000, max: 216000 },
    { min: 202000, max: 202000 },
    { min: 131000, max: 131000 },
    { min: 89000, max: 89000 },
    { min: 89000, max: 89000 },
  ],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [
    { min: 60, max: 60 },
    { min: 60, max: 60 },
    { min: 56, max: 56 },
    { min: 36, max: 36 },
    { min: 25, max: 25 },
    { min: 25, max: 25 },
  ],
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
        totals: report.competences.map(() => ({ min: 0, max: 0 })),
        pct_of_fixed_net: report.competences.map(() => ({ min: 0, max: 0 })),
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
      pct_of_fixed_net: [108, 108, 101, 65, 44, 44].map((v) => ({
        min: v,
        max: v,
      })),
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

  // Task 6 (fatia ⑥, §2/§5 do spec): totals/pct_of_fixed_net viraram FAIXA —
  // a tela precisa mostrar um INTERVALO ("R$ 2.400,00 a R$ 2.988,00"), não
  // um número só, quando min !== max (ex.: DAS variando com o faturamento).
  it('faixa de verdade (min !== max) aparece como intervalo, não como um número só', async () => {
    const reportComFaixa = {
      ...report,
      totals: [{ min: 240000, max: 298800 }, ...report.totals.slice(1)],
      pct_of_fixed_net: [
        { min: 66, max: 83 },
        ...report.pct_of_fixed_net.slice(1),
      ],
    }
    mockFetch({ ok: true, data: reportComFaixa, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('total-0')).toHaveTextContent(
        'R$ 2.400,00 a R$ 2.988,00',
      ),
    )
    expect(screen.getByTestId('pct-0')).toHaveTextContent('66% a 83%')
  })

  // §5 do spec: "o alerta de 50% dispara pelo TETO, não pelo piso" — a tela
  // existe pra mostrar risco, e o pior mês é o risco. Piso ABAIXO do
  // limiar + teto ACIMA precisa disparar o alerta; o teste anterior
  // ("destaca em vermelho só o que passa de 50%") já prova o caso
  // degenerado (min === max) nos dois lados do limiar — este prova a FAIXA
  // cruzando o limiar especificamente.
  it('alerta de 50%: dispara pelo TETO — piso abaixo do limiar, teto acima', async () => {
    const reportCruzandoLimiar = {
      ...report,
      // 40% (piso, abaixo de 50) a 60% (teto, acima de 50).
      pct_of_fixed_net: [
        { min: 40, max: 60 },
        ...report.pct_of_fixed_net.slice(1),
      ],
    }
    mockFetch({ ok: true, data: reportCruzandoLimiar, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('pct-0')).toHaveTextContent('40% a 60%'),
    )
    // Piso (40%) está ABAIXO do limiar — se o alerta disparasse pelo piso,
    // esta célula NÃO teria a classe. Ela precisa ter, porque o teto (60%)
    // está acima.
    expect(screen.getByTestId('pct-0')).toHaveClass('alerta')
  })

  it('alerta de 50%: NÃO dispara quando até o teto fica no limiar ou abaixo', async () => {
    const reportSemRisco = {
      ...report,
      pct_of_fixed_net: [
        { min: 10, max: 50 },
        ...report.pct_of_fixed_net.slice(1),
      ],
    }
    mockFetch({ ok: true, data: reportSemRisco, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('pct-0')).toHaveTextContent('10% a 50%'),
    )
    expect(screen.getByTestId('pct-0')).not.toHaveClass('alerta')
  })

  // Regra do brief: intervalo DEGENERADO (min === max) não pode virar
  // ruído visual repetindo o mesmo número duas vezes.
  it('faixa degenerada (min === max) mostra um número só, nunca repetido', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('total-0')).toHaveTextContent('R$ 2.160,00'),
    )
    expect(screen.getByTestId('total-0')).not.toHaveTextContent(
      'R$ 2.160,00 a R$ 2.160,00',
    )
    expect(screen.getByTestId('pct-0')).toHaveTextContent('60%')
    expect(screen.getByTestId('pct-0')).not.toHaveTextContent('60% a 60%')
  })

  // Regressão específica desta task: nenhum valor de faixa pode vazar como
  // `[object Object]` — o defeito medido que motivou a task inteira.
  it('nenhum valor de faixa renderiza como [object Object]', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })

    const { container } = render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('total-0')).toBeInTheDocument(),
    )
    expect(container.textContent).not.toContain('[object Object]')
  })

  // Task 5 (ajuda contextual, §3.2 do spec): "Comprometido (e bloco da
  // home)" — este é a tela dedicada (`#/comprometido`); "Comprometido /
  // Configurações" — "Renda de referência" também mora aqui. Os dois
  // pontos vivem na mesma tela; um teste por termo.
  it('ajuda: "Comprometido" abre no clique com o texto do que conta como comprometido', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })
    const user = userEvent.setup()

    render(<CommitmentsPage from="2026-08" />)
    await waitFor(() =>
      expect(screen.getByTestId('linha-a1')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Comprometido' }),
    )
    expect(await screen.findByText(/parcelas previstas/)).toBeInTheDocument()
  })

  it('ajuda: "Renda de referência" abre no clique com o texto do porquê do denominador', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })
    const user = userEvent.setup()

    render(<CommitmentsPage from="2026-08" />)
    await waitFor(() =>
      expect(screen.getByTestId('linha-a1')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Renda de referência' }),
    )
    expect(await screen.findByText(/R\$ 5.300/)).toBeInTheDocument()
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

  // ③ `tabular-nums` existia em UM lugar no app inteiro. Numa matriz
  // competência × conta os dígitos com larguras diferentes destroem a
  // leitura de coluna, que é a única leitura que esta tabela tem.
  it('as células de dinheiro (matriz, TOTAL e %) usam tabular-nums', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-a1')).toBeInTheDocument(),
    )

    expect(screen.getByTestId('celula-a1-0')).toHaveClass('tabular-nums')
    expect(screen.getByTestId('total-0')).toHaveClass('tabular-nums')
    expect(screen.getByTestId('pct-0')).toHaveClass('tabular-nums')
  })
})
