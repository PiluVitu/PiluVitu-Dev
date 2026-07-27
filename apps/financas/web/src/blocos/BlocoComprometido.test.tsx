import { render, screen, waitFor } from '@testing-library/react'
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
  // de uma barra que não existe no DOM não prova nada.
  totals: [200000, 180000, 150000, 120000, 90000, 60000],
  fixed_net_cents: 360000,
  // 55%, 51%, EXATAMENTE 50%, 49%, 25%, 10% — o limiar é "> 50", não ">=",
  // então a barra de 50% precisa continuar com a cor padrão (mesma
  // convenção de `commitments.tsx#LIMIAR_ALERTA_PCT`).
  pct_of_fixed_net: [55, 51, 50, 49, 25, 10],
}

const reportVazio = {
  competences: report.competences,
  rows: [],
  totals: [0, 0, 0, 0, 0, 0],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [0, 0, 0, 0, 0, 0],
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
