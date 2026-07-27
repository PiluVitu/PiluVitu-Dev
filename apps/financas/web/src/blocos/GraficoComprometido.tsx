import { formatBRL } from '@piluvitu/tools/money'
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { rotuloCompetencia } from '../pages/commitments'
import type { CommitmentReportView } from '../pages/commitments'

/** Acima disso, metade da renda fixa já está comprometida — mesmo limiar de `commitments.tsx`. */
const LIMIAR_ALERTA_PCT = 50

// Tokens do design system (@piluvitu/ui/styles.css), nunca hex solto — é o
// que faz o dark mode funcionar sem tocar neste arquivo (Task 6, requisito
// explícito do brief).
const COR_ALERTA = 'hsl(var(--destructive))'
const COR_PADRAO = 'hsl(var(--primary))'
const COR_REFERENCIA = 'hsl(var(--muted-foreground))'

const LARGURA = 640
const ALTURA = 220

/**
 * Módulo separado de `BlocoComprometido.tsx` DE PROPÓSITO — é o arquivo
 * que carrega `recharts` (+110 KB gzip, medido), e só ele é importado via
 * `lazy()`/`import()` dinâmico. Um `import` estático de `recharts` no
 * bundle principal pesaria a primeira pintura da home inteira, mesmo pra
 * quem nunca rola até este bloco.
 *
 * Sem `ResponsiveContainer`: largura/altura fixas (`LARGURA`/`ALTURA`)
 * evitam depender de `ResizeObserver` (ausente no jsdom dos testes, e
 * `ResponsiveContainer` não renderiza filhos sem uma medição real) — o
 * container externo (`overflow-x-auto`) rola horizontalmente em telas
 * estreitas (Android) em vez de espremer as barras.
 */
export default function GraficoComprometido({
  report,
}: {
  report: CommitmentReportView
}) {
  const dados = report.competences.map((competence, i) => ({
    competence,
    rotulo: rotuloCompetencia(competence),
    total: report.totals[i],
    pct: report.pct_of_fixed_net[i],
  }))

  return (
    <div className="overflow-x-auto" data-testid="grafico-comprometido">
      <BarChart width={LARGURA} height={ALTURA} data={dados}>
        <XAxis dataKey="rotulo" fontSize={12} />
        <YAxis
          width={72}
          fontSize={12}
          tickFormatter={(v: number) => formatBRL(v)}
        />
        <Tooltip formatter={(v) => formatBRL(Number(v))} />
        <ReferenceLine
          y={report.fixed_net_cents}
          stroke={COR_REFERENCIA}
          strokeDasharray="4 4"
          label={{
            value: `Líquido fixo: ${formatBRL(report.fixed_net_cents)}`,
            position: 'insideTopLeft',
            fontSize: 11,
            fill: COR_REFERENCIA,
          }}
        />
        <Bar dataKey="total" isAnimationActive={false}>
          {dados.map((d) => (
            <Cell
              key={d.competence}
              fill={d.pct > LIMIAR_ALERTA_PCT ? COR_ALERTA : COR_PADRAO}
            />
          ))}
        </Bar>
      </BarChart>
    </div>
  )
}
