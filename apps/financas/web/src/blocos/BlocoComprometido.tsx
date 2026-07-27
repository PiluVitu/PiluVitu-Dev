import { lazy, Suspense, useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import { competenciaAtual } from '../lib/dates'
import type { CommitmentReportView } from '../pages/commitments'
import { Bloco } from './Bloco'

const GraficoComprometido = lazy(() => import('./GraficoComprometido'))

const MESES = 6

/**
 * "Dos próximos 6 meses, quanto da renda fixa (SEM freela) já está
 * comprometido" — a tela que justifica o módulo inteiro. Autônomo: não
 * recebe `from` por prop, calcula a competência atual sozinho (mesma
 * fonte que `App.tsx` usava pra `CommitmentsPage`, ver `lib/dates.ts`).
 */
export function BlocoComprometido() {
  const [report, setReport] = useState<CommitmentReportView | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<CommitmentReportView>(
      `/api/reports/commitments?from=${competenciaAtual()}&months=${MESES}`,
    )
      .then((data) => {
        if (vivo) setReport(data)
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  const carregando = report === null && erro === null
  // Estado real de produção HOJE (0 contas, 0 lançamentos): a API responde
  // 200 com `rows: []` — não é um erro, é "nada comprometido ainda".
  const vazio = report !== null && report.rows.length === 0

  return (
    <Bloco
      titulo="Comprometido"
      carregando={carregando}
      erro={erro}
      vazio={vazio}
      vazioMensagem={`Nenhum compromisso nos próximos ${MESES} meses.`}
    >
      {report ? (
        <Suspense fallback={<div aria-busy="true" />}>
          <GraficoComprometido report={report} />
        </Suspense>
      ) : null}
    </Bloco>
  )
}
