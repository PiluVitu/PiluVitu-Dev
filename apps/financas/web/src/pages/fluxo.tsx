import { lazy, Suspense, useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Card, CardContent } from '@piluvitu/ui/card'
import { api, ApiError } from '../api'
import type { CashflowReportView } from '../lib/cashflow'
import { addMonthsToCompetence, competenciaAtual } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'

// Reusa o MESMO módulo lazy que `blocos/BlocoComprometido.tsx`/
// `blocos/BlocoCategorias.tsx` já carregam sob demanda — nunca um terceiro
// `import()` de `recharts` (~104 KB gzip). `GraficoFluxo` é uma exportação
// NOMEADA de `GraficoComprometido.tsx` (mesmo padrão que `GraficoCategorias`
// já usa); resolver este `import()` aponta pro MESMO chunk físico, então o
// custo é pago uma vez só — `scripts/check-financas-lazy-chart.mjs`
// continua válido sem alteração.
const GraficoFluxo = lazy(() =>
  import('../blocos/GraficoComprometido').then((m) => ({
    default: m.GraficoFluxo,
  })),
)

// Espelha o teto real de `cashflow()` (`src/domain/cashflow.ts`, Worker:
// `months` 1..24) — não oferecer no seletor uma janela que a rota sempre
// recusaria com 400.
const JANELAS = [6, 12, 24] as const

export function FluxoPage() {
  const [months, setMonths] = useState<number>(12)
  const [report, setReport] = useState<CashflowReportView | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Padrão "N meses até o mês corrente" (spec §5) — `from` é sempre
  // recalculado a partir da janela escolhida, nunca guardado separado dela
  // (evitaria os dois ficarem dessincronizados).
  const from = addMonthsToCompetence(competenciaAtual(), -(months - 1))

  useEffect(() => {
    let vivo = true
    setError(null)
    api<CashflowReportView>(
      `/api/reports/cashflow?from=${from}&months=${months}`,
    )
      .then((data) => {
        if (vivo) setReport(data)
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [from, months])

  if (error) return <p role="alert">{error}</p>
  if (!report) return <p>Carregando…</p>

  // "Vazio" aqui não é `linhas` vazio — o domínio sempre devolve `months`
  // linhas, uma por mês, mesmo sem movimento (§5 do spec: "mês sem
  // movimento aparece zerado, não some"). O vazio real desta tela é TODA a
  // janela sem nenhum lançamento liquidado — só aí faz sentido substituir
  // o gráfico por uma explicação em vez de uma janela inteira de barras
  // ausentes.
  const vazio = report.linhas.every(
    (l) => l.entrou_cents === 0 && l.saiu_cents === 0,
  )

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Fluxo de caixa
        </h1>
        <Ajuda rotulo="Fluxo de caixa">
          Entrou, saiu, saldo e acumulado, mês a mês — só o que já se moveu de
          verdade (lançamento liquidado). Parcela prevista é compromisso, não
          caixa; ela é assunto do Comprometido, não desta tela.
        </Ajuda>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        Janela
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className={`${SELECT_CLASSNAME} w-auto`}
        >
          {JANELAS.map((m) => (
            <option key={m} value={m}>
              {m} meses
            </option>
          ))}
        </select>
      </label>

      {vazio ? (
        <p className="text-muted-foreground text-sm">
          Nenhum lançamento liquidado nesta janela. Só entra aqui o que já saiu
          ou entrou de fato de uma conta — uma parcela prevista ainda não é
          caixa, é compromisso (veja em Comprometido).
        </p>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Suspense fallback={<div aria-busy="true" />}>
              <GraficoFluxo report={report} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b py-1.5 pr-2 text-left font-medium">
                Mês
              </th>
              <th className="border-b px-2 py-1.5 text-right font-medium">
                Entrou
              </th>
              <th className="border-b px-2 py-1.5 text-right font-medium">
                Saiu
              </th>
              <th className="border-b px-2 py-1.5 text-right font-medium">
                Saldo
              </th>
              <th className="border-b px-2 py-1.5 text-right font-medium">
                Acumulado
              </th>
            </tr>
          </thead>
          <tbody>
            {report.linhas.map((l) => (
              <tr key={l.competence} data-testid={`linha-${l.competence}`}>
                <td className="border-b py-1.5 pr-2 text-left">
                  {l.competence}
                </td>
                <td
                  data-testid="entrou"
                  className="border-b px-2 py-1.5 text-right"
                >
                  {formatBRL(l.entrou_cents)}
                </td>
                <td
                  data-testid="saiu"
                  className="border-b px-2 py-1.5 text-right"
                >
                  {formatBRL(l.saiu_cents)}
                </td>
                <td
                  data-testid="saldo"
                  className="border-b px-2 py-1.5 text-right"
                >
                  {formatBRL(l.saldo_cents)}
                </td>
                <td
                  data-testid="acumulado"
                  className="border-b px-2 py-1.5 text-right font-medium"
                >
                  {formatBRL(l.acumulado_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
