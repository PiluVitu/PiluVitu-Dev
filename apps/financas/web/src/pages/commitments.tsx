import { lazy, Suspense, useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { LIMIAR_ALERTA_PCT, rotuloCompetencia } from '../lib/commitments'
import type { CommitmentReportView } from '../lib/commitments'

// Reusa o MESMO módulo lazy que `blocos/BlocoComprometido.tsx` carrega sob
// demanda — não uma segunda cópia do gráfico. `GraficoComprometido.tsx` é o
// único arquivo que importa `recharts` (~104 KB gzip); resolver este
// `import()` aponta pro mesmo chunk físico que o bloco da home já carrega,
// então o custo é pago uma vez só (mesmo padrão de
// `blocos/BlocoCategorias.tsx`, que faz o mesmo pra `GraficoCategorias`).
//
// ⚠️ Decisão desta migração: NÃO renderiza `<BlocoComprometido />` (o card
// autônomo da home) aqui dentro — `BlocoComprometido` busca seus PRÓPRIOS
// dados (sempre a competência ATUAL, sem props), então embutir o
// componente inteiro faria esta tela disparar um SEGUNDO fetch
// independente (com uma querystring que nem sempre bate com `from`/`months`
// recebidos por prop) só pra mostrar o mesmo gráfico — e ainda aninharia um
// segundo card "Comprometido" dentro desta página, que já tem seu próprio
// título e seus próprios estados de carregando/erro. O que de fato evita
// "duas implementações do mesmo gráfico" é o módulo `GraficoComprometido`
// em si (a peça pesada/reusável) — compartilhado aqui a partir do MESMO
// `report` que esta página já buscou, sem round-trip extra.
const GraficoComprometido = lazy(() => import('../blocos/GraficoComprometido'))

export function CommitmentsPage({
  from,
  months = 6,
}: {
  from: string
  months?: number
}) {
  const [report, setReport] = useState<CommitmentReportView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<CommitmentReportView>(
      `/api/reports/commitments?from=${from}&months=${months}`,
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

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Comprometido</h1>
      <p className="text-muted-foreground text-sm">
        Denominador: líquido fixo (mês sem freela) de{' '}
        <strong data-testid="denominador" className="text-foreground">
          {formatBRL(report.fixed_net_cents)}
        </strong>
        .
      </p>

      {report.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma parcela ou dívida em aberto na janela.
        </p>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Suspense fallback={<div aria-busy="true" />}>
              <GraficoComprometido report={report} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por conta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead data-testid="cabecalho">
                <tr>
                  <th className="border-b py-1.5 pr-2 text-left font-medium" />
                  {report.competences.map((c) => (
                    <th
                      key={c}
                      className="border-b px-2 py-1.5 text-right font-medium"
                    >
                      {rotuloCompetencia(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.account_id} data-testid={`linha-${r.account_id}`}>
                    <td className="border-b py-1.5 pr-2 text-left">
                      {r.account_name}
                    </td>
                    {r.cells.map((cents, i) => (
                      <td
                        key={i}
                        data-testid={`celula-${r.account_id}-${i}`}
                        className="border-b px-2 py-1.5 text-right"
                      >
                        {cents === 0 ? '—' : formatBRL(cents)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {/*
                Fidelidade com o `tfoot th, tfoot td { border-top: 2px }`
                apagado (fix round 1, Task 9): a regra original valia pras
                DUAS linhas do tfoot (o seletor não distinguia TOTAL de %),
                e `th, td { border-bottom }` (regra geral) também alcançava
                as duas — nunca foi sobrescrita, só somada. Sem repetir
                isso aqui, o divisor entre TOTAL e % (e a borda inferior da
                tabela) sumiam silenciosamente em vez de terem sido uma
                escolha.
              */}
              <tfoot>
                <tr>
                  <th className="border-t-2 border-b py-1.5 pr-2 text-left font-medium">
                    TOTAL
                  </th>
                  {report.totals.map((cents, i) => (
                    <td
                      key={i}
                      data-testid={`total-${i}`}
                      className="border-t-2 border-b px-2 py-1.5 text-right font-medium"
                    >
                      {formatBRL(cents)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="border-t-2 border-b py-1.5 pr-2 text-left font-medium">
                    % do líquido fixo
                  </th>
                  {report.pct_of_fixed_net.map((pct, i) => (
                    <td
                      key={i}
                      data-testid={`pct-${i}`}
                      className={cn(
                        'border-t-2 border-b px-2 py-1.5 text-right',
                        pct > LIMIAR_ALERTA_PCT &&
                          'alerta text-destructive font-bold',
                      )}
                    >
                      {pct}%
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
