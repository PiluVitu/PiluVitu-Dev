import { useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import { rotuloCompetencia } from '../lib/commitments'
import type { CommitmentReportView } from '../lib/commitments'

/** Acima disso, metade da renda fixa já está comprometida antes de qualquer compra nova. */
const LIMIAR_ALERTA_PCT = 50

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
    <section>
      <h1>Comprometido</h1>
      <p>
        Denominador: líquido fixo (mês sem freela) de{' '}
        <strong data-testid="denominador">
          {formatBRL(report.fixed_net_cents)}
        </strong>
        .
      </p>

      {report.rows.length === 0 ? (
        <p>Nenhuma parcela ou dívida em aberto na janela.</p>
      ) : null}

      <table>
        <thead data-testid="cabecalho">
          <tr>
            <th />
            {report.competences.map((c) => (
              <th key={c}>{rotuloCompetencia(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.account_id} data-testid={`linha-${r.account_id}`}>
              <td>{r.account_name}</td>
              {r.cells.map((cents, i) => (
                <td key={i} data-testid={`celula-${r.account_id}-${i}`}>
                  {cents === 0 ? '—' : formatBRL(cents)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>TOTAL</th>
            {report.totals.map((cents, i) => (
              <td key={i} data-testid={`total-${i}`}>
                {formatBRL(cents)}
              </td>
            ))}
          </tr>
          <tr>
            <th>% do líquido fixo</th>
            {report.pct_of_fixed_net.map((pct, i) => (
              <td
                key={i}
                data-testid={`pct-${i}`}
                className={pct > LIMIAR_ALERTA_PCT ? 'alerta' : undefined}
              >
                {pct}%
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
