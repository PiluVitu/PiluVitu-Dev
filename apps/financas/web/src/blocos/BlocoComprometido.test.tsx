import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { BlocoComprometido } from './BlocoComprometido'

// Mockar `api` (não a rede) — pedido explícito da task: `api` já traduz o
// envelope e os erros, testar nesse nível é o que prova o comportamento do
// COMPONENTE, não do transporte HTTP (isso já é responsabilidade de
// `api.test.ts`).
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

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
      account_id: 'a1',
      account_name: 'Nubank cartão',
      cells: [200000, 180000, 150000, 120000, 90000, 60000],
    },
  ],
  // Todos NÃO-ZERO de propósito: recharts (MEDIDO, v3.10.1) não desenha
  // `<path class="recharts-rectangle">` pra barra de valor 0 — testar a cor
  // de uma barra que não existe no DOM não prova nada. Degenerado
  // (min === max) de propósito: este teste é sobre COR/limiar, a faixa em
  // si tem describe dedicado em GraficoComprometido.test.tsx.
  totals: [200000, 180000, 150000, 120000, 90000, 60000].map((v) => ({
    min: v,
    max: v,
  })),
  fixed_net_cents: 360000,
  // 55%, 51%, EXATAMENTE 50%, 49%, 25%, 10% — o limiar é "> 50", não ">=",
  // então a barra de 50% precisa continuar com a cor padrão (mesma
  // convenção de `commitments.tsx#LIMIAR_ALERTA_PCT`). Degenerado: o teto
  // (o que decide a cor, Task 6) bate com o piso.
  pct_of_fixed_net: [55, 51, 50, 49, 25, 10].map((v) => ({ min: v, max: v })),
}

const reportVazio = {
  competences: report.competences,
  rows: [],
  totals: report.competences.map(() => ({ min: 0, max: 0 })),
  fixed_net_cents: 360000,
  pct_of_fixed_net: report.competences.map(() => ({ min: 0, max: 0 })),
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('BlocoComprometido', () => {
  it('busca o relatório e, quando o gráfico (lazy) termina de carregar, mostra o conteúdo', async () => {
    vi.mocked(api).mockResolvedValue(report)

    render(<BlocoComprometido />)

    expect(
      screen.getByRole('heading', { name: 'Comprometido' }),
    ).toBeInTheDocument()

    // Prova o COMPORTAMENTO de UI: o gráfico só aparece depois que `report`
    // chega (o `<Suspense>` só é montado dentro de `{report ? ... : null}`
    // em BlocoComprometido.tsx) — não antes, e não instantaneamente no
    // primeiro render síncrono.
    //
    // ⚠️ Isto NÃO prova code-splitting/bundle isolado — essa garantia não é
    // observável num teste de unidade: o mock de `api` sempre resolve numa
    // promise (microtask), então esta asserção passaria IGUAL se
    // `GraficoComprometido` fosse importado estaticamente no topo do
    // arquivo, porque o gate real é o `{report ? ... : null}`, não o
    // `import()` em si (achado da revisão da Task 6, fix round 1). A
    // garantia de que `recharts` está de fato isolado num chunk lazy — e
    // ausente do chunk de entrada — é responsabilidade de
    // `scripts/check-financas-lazy-chart.mjs`, rodado no `build` (ver
    // apps/financas/CLAUDE.md § Home). Aqui só interessa o comportamento
    // visível: skeleton → conteúdo, sem flash de gráfico vazio.
    expect(screen.queryByTestId('grafico-comprometido')).not.toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByTestId('grafico-comprometido')).toBeInTheDocument(),
    )

    expect(api).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/api\/reports\/commitments\?from=\d{4}-\d{2}&months=6$/,
      ),
    )
  })

  it('pinta em vermelho — via token --destructive, nunca hex — só as barras acima de 50%', async () => {
    vi.mocked(api).mockResolvedValue(report)

    const { container } = render(<BlocoComprometido />)
    await waitFor(() =>
      expect(screen.getByTestId('grafico-comprometido')).toBeInTheDocument(),
    )

    const barras = container.querySelectorAll('.recharts-rectangle')
    expect(barras.length).toBe(6)
    const fills = Array.from(barras).map((b) => b.getAttribute('fill'))

    // 55%, 51%, 50% (exatamente no limiar — NÃO conta), 49%, 25%, 10%
    expect(fills[0]).toBe('hsl(var(--destructive))')
    expect(fills[1]).toBe('hsl(var(--destructive))')
    expect(fills[2]).toBe('hsl(var(--primary))')
    expect(fills[3]).toBe('hsl(var(--primary))')
    expect(fills[4]).toBe('hsl(var(--primary))')
    expect(fills[5]).toBe('hsl(var(--primary))')

    // nunca hex solto
    for (const fill of fills) {
      expect(fill).not.toMatch(/^#/)
      expect(fill).toMatch(/^hsl\(var\(--/)
    }
  })

  it('estado vazio (produção hoje: 0 contas, 0 lançamentos) mostra a mensagem de vazio, não o gráfico', async () => {
    vi.mocked(api).mockResolvedValue(reportVazio)

    render(<BlocoComprometido />)

    await waitFor(() =>
      expect(screen.getByText(/nenhum compromisso/i)).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('grafico-comprometido')).not.toBeInTheDocument()
  })

  // Task 10: fixed_net_cents deixou de ser sempre o hardcode 360000 — passou
  // a poder ser o valor SALVO em settings (PUT /api/settings), lido pelo
  // backend em GET /api/reports/commitments (BlocoComprometido não muda o
  // jeito de chamar a rota; o default veio de lá). Este teste prova que o
  // componente REFLETE o que a API devolveu, não um número fixo — mockando
  // um fixed_net_cents DIFERENTE do default (548000 = R$ 5.480, o líquido
  // COM freela citado no brief) e conferindo que a linha de referência do
  // gráfico usa exatamente esse valor, não 360000.
  // MEDIDO: a ReferenceLine (GraficoComprometido.tsx) só aparece no SVG
  // quando `fixed_net_cents` cai DENTRO do domínio do eixo Y (que o
  // recharts calcula a partir do maior `total` das barras) — acima disso,
  // `ifOverflow` (default 'discard') simplesmente NÃO renderiza a linha
  // nem o label, em qualquer ambiente (não é peculiaridade do jsdom). Por
  // isso este teste usa 180000 (R$ 1.800, abaixo do maior total do mock,
  // 200000), não o "líquido com freela" (R$ 5.480) citado no brief — um
  // valor acima do domínio não provaria nada, porque a linha não apareceria
  // de qualquer forma.
  it('Task 10: usa o fixed_net_cents que a API devolveu, não um valor fixo — prova que a renda salva chega até o gráfico', async () => {
    vi.mocked(api).mockResolvedValue({ ...report, fixed_net_cents: 180000 })

    const { container } = render(<BlocoComprometido />)
    await waitFor(() =>
      expect(screen.getByTestId('grafico-comprometido')).toBeInTheDocument(),
    )

    // Label da ReferenceLine monta o texto a partir de
    // `report.fixed_net_cents` — se o componente hardcodasse 360000 em
    // algum lugar, este texto continuaria "R$ 3.600,00" mesmo com o mock
    // devolvendo 180000. `container.textContent` (não `getByText`) porque o
    // SVG do recharts quebra o texto do label em mais de um nó (`<text>` +
    // `<tspan>`) — o que importa aqui é o VALOR, não a estrutura interna.
    expect(container.textContent).toContain('Líquido fixo: R$ 1.800,00')
  })

  // Task 5 (ajuda contextual, §3.2 do spec): "Comprometido (e bloco da
  // home)" — este é o "bloco da home". Popover no toque, não tooltip de
  // hover (ver packages/ui/CLAUDE.md) — clique, não mouseOver, é o que
  // distingue de um Tooltip que abriria com hover sozinho.
  it('ajuda: o gatilho "Ajuda sobre Comprometido" abre o texto explicativo ao clicar', async () => {
    vi.mocked(api).mockResolvedValue(report)
    const user = userEvent.setup()

    render(<BlocoComprometido />)

    const gatilho = screen.getByRole('button', {
      name: 'Ajuda sobre Comprometido',
    })
    expect(screen.queryByText(/parcelas previstas/)).not.toBeInTheDocument()

    await user.click(gatilho)

    expect(await screen.findByText(/parcelas previstas/)).toBeInTheDocument()
  })

  // ① O card que justifica o módulo mostrava 6 barras em R$ e NENHUM
  // número — e o `%`, que já vinha no payload, era descartado.
  it('manchete: o % e o valor do MÊS CORRENTE aparecem como texto, acima do gráfico', async () => {
    vi.mocked(api).mockResolvedValue(report)

    render(<BlocoComprometido />)

    // report[0] = 55% / R$ 2.000,00 (a competência corrente, porque a
    // busca é `?from=competenciaAtual()`)
    expect(await screen.findByTestId('manchete-pct')).toHaveTextContent('55%')
    expect(screen.getByTestId('manchete-total')).toHaveTextContent(
      'R$ 2.000,00',
    )

    // é o mês CORRENTE, não um mês qualquer da janela: 51% (a 2ª
    // competência) não pode aparecer na manchete
    expect(screen.getByTestId('manchete-pct')).not.toHaveTextContent('51%')
  })

  it('manchete acima de 50%: fica em --destructive E ganha uma frase que NOMEIA o limiar (cor não é o único sinal)', async () => {
    vi.mocked(api).mockResolvedValue(report) // [0] = 55%, acima do limiar

    render(<BlocoComprometido />)

    const pct = await screen.findByTestId('manchete-pct')
    expect(pct).toHaveClass('text-destructive')

    // A redundância não-cromática da manchete — mesma razão medida de ⑤:
    // --primary × --destructive ficam a 1,80:1, então quem não distingue
    // as duas cores precisa de TEXTO dizendo o que aconteceu.
    const alerta = screen.getByTestId('manchete-alerta')
    expect(alerta).toHaveAttribute('role', 'alert')
    expect(alerta).toHaveTextContent('50%')
  })

  it('manchete EXATAMENTE no limiar (50%) não alerta — o limiar é ">", nunca ">="', async () => {
    vi.mocked(api).mockResolvedValue({
      ...report,
      pct_of_fixed_net: [
        { min: 50, max: 50 },
        ...report.pct_of_fixed_net.slice(1),
      ],
    })

    render(<BlocoComprometido />)

    const pct = await screen.findByTestId('manchete-pct')
    expect(pct).toHaveTextContent('50%')
    expect(pct).not.toHaveClass('text-destructive')
    expect(screen.queryByTestId('manchete-alerta')).not.toBeInTheDocument()
  })

  it('manchete segue o TETO da faixa (decisão: teto no Comprometido), nunca o piso', async () => {
    vi.mocked(api).mockResolvedValue({
      ...report,
      totals: [{ min: 240000, max: 298800 }, ...report.totals.slice(1)],
      // piso 40% (abaixo do limiar), teto 66% (acima) — se a manchete
      // olhasse o piso, não haveria alerta nenhum
      pct_of_fixed_net: [
        { min: 40, max: 66 },
        ...report.pct_of_fixed_net.slice(1),
      ],
    })

    render(<BlocoComprometido />)

    expect(await screen.findByTestId('manchete-pct')).toHaveTextContent(
      '40% a 66%',
    )
    expect(screen.getByTestId('manchete-pct')).toHaveClass('text-destructive')
    expect(screen.getByTestId('manchete-alerta')).toBeInTheDocument()
    // faixa de verdade também no valor, não só na porcentagem
    expect(screen.getByTestId('manchete-total')).toHaveTextContent(
      'R$ 2.400,00 a R$ 2.988,00',
    )
  })

  it('manchete usa tabular-nums — a coluna de números precisa alinhar', async () => {
    vi.mocked(api).mockResolvedValue(report)

    expect(
      (render(<BlocoComprometido />),
      await screen.findByTestId('manchete-pct')),
    ).toHaveClass('tabular-nums')
    expect(screen.getByTestId('manchete-total')).toHaveClass('tabular-nums')
  })

  it('estado vazio não renderiza manchete nenhuma — não existe "0% de nada"', async () => {
    vi.mocked(api).mockResolvedValue(reportVazio)

    render(<BlocoComprometido />)

    await waitFor(() =>
      expect(screen.getByText(/nenhum compromisso/i)).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('manchete-pct')).not.toBeInTheDocument()
  })

  it('estado erro: mostra a mensagem dentro do próprio card, com role="alert"', async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError(503, 'auth_unavailable', 'sem conexão com o servidor'),
    )

    render(<BlocoComprometido />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'sem conexão com o servidor',
      ),
    )
    expect(screen.queryByTestId('grafico-comprometido')).not.toBeInTheDocument()
  })
})
