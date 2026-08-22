import { lazy, Suspense, useEffect, useState } from 'react'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { competenciaAtual } from '../lib/dates'
import { NUMERO_GRID } from '../lib/tipografia'
import {
  formatPctRange,
  formatRange,
  LIMIAR_ALERTA_PCT,
  rotuloCompetencia,
} from '../lib/commitments'
import type { CommitmentReportView } from '../lib/commitments'
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
      ajuda={
        <Ajuda rotulo="Comprometido">
          O que já está prometido dos próximos meses: parcelas previstas +
          dívidas em aberto.
        </Ajuda>
      }
      carregando={carregando}
      erro={erro}
      vazio={vazio}
      vazioMensagem={`Nenhum compromisso nos próximos ${MESES} meses.`}
    >
      {report ? (
        <div className="space-y-3">
          <Manchete report={report} />
          <Suspense fallback={<div aria-busy="true" />}>
            <GraficoComprometido report={report} />
          </Suspense>
        </div>
      ) : null}
    </Bloco>
  )
}

/**
 * ① **O card que justifica o módulo mostrava 6 barras em R$ e NENHUM
 * número — e o `%`, que já vinha no payload, era DESCARTADO.** A pergunta
 * do dono aqui é uma só ("quanto da minha renda fixa já está prometido?"),
 * e a resposta estava só na altura relativa de uma barra contra uma linha
 * tracejada. Agora ela é texto, grande, antes do gráfico.
 *
 * ⚠️ **Índice `[0]` é o MÊS CORRENTE, não uma escolha arbitrária:** a busca
 * é `?from=competenciaAtual()`, então a primeira competência da janela é
 * sempre o mês em que o dono está. É também exatamente a barra que o eixo X
 * deixava sem rótulo antes do ② — as duas mudanças atacam o mesmo buraco
 * por lados diferentes.
 *
 * ⚠️ **O alerta olha o TETO (`max`), nunca o piso** — decisão já tomada e
 * provada no resto do Comprometido (`pages/commitments.tsx`,
 * `GraficoComprometido`): esta tela existe pra mostrar RISCO, e o pior mês
 * é o risco. `LIMIAR_ALERTA_PCT` é importado de `lib/commitments.ts`, nunca
 * um `50` solto — é o mesmo limiar que pinta a barra e a célula de `%`, e
 * um segundo número aqui deixaria a manchete e o gráfico se contradizendo
 * dentro do MESMO card.
 *
 * ⚠️ **Em alerta, a cor não é o único sinal** (mesma razão medida de ⑤, em
 * `GraficoComprometido.tsx`: `--primary` × `--destructive` a 1,80:1/1,31:1):
 * junto vem uma frase `role="alert"` que NOMEIA o limiar. Quem não
 * distingue as duas cores lê a frase.
 */
function Manchete({ report }: { report: CommitmentReportView }) {
  const pct = report.pct_of_fixed_net[0]
  const total = report.totals[0]
  const competencia = report.competences[0]
  // Janela sempre tem `months` competências (a rota garante), mas um
  // relatório sem nenhuma não pode derrubar o card inteiro.
  if (pct === undefined || total === undefined) return null

  const emAlerta = pct.max > LIMIAR_ALERTA_PCT

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          data-testid="manchete-pct"
          className={cn(NUMERO_GRID, emAlerta && 'text-destructive')}
        >
          {formatPctRange(pct)}
        </span>
        <span
          data-testid="manchete-total"
          className={cn(NUMERO_GRID, emAlerta && 'text-destructive')}
        >
          {formatRange(total)}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        da renda fixa já comprometida em {rotuloCompetencia(competencia)}
      </p>
      {emAlerta ? (
        <p
          role="alert"
          data-testid="manchete-alerta"
          className="text-destructive text-xs font-medium"
        >
          acima de {LIMIAR_ALERTA_PCT}% — mais da metade da renda fixa já está
          prometida antes de qualquer gasto novo
        </p>
      ) : null}
    </div>
  )
}
