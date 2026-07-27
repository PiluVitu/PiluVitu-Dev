import { formatBRL } from '@piluvitu/tools/money'
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { rotuloCompetencia } from '../lib/commitments'
import type { CommitmentReportView } from '../lib/commitments'

/** Acima disso, metade da renda fixa já está comprometida — mesmo limiar de `commitments.tsx`. */
const LIMIAR_ALERTA_PCT = 50

// Tokens do design system (@piluvitu/ui/styles.css), nunca hex solto — é o
// que faz o dark mode funcionar sem tocar neste arquivo (Task 6, requisito
// explícito do brief).
const COR_ALERTA = 'hsl(var(--destructive))'
const COR_PADRAO = 'hsl(var(--primary))'
const COR_REFERENCIA = 'hsl(var(--muted-foreground))'

const ALTURA = 220
const LARGURA_MAXIMA = 640
const LARGURA_MINIMA = 280
// `CardContent` (@piluvitu/ui/card) tem `p-6` (24px) de cada lado + folga da
// página — 64px é conservador de propósito: melhor um pouco de espaço
// sobrando do que estourar a largura real do card e forçar scroll.
const MARGEM_HORIZONTAL = 64

function larguraDoGrafico(): number {
  return Math.max(
    LARGURA_MINIMA,
    Math.min(LARGURA_MAXIMA, window.innerWidth - MARGEM_HORIZONTAL),
  )
}

/**
 * Largura do gráfico acompanhando o viewport — SEM `ResponsiveContainer`.
 *
 * ⚠️ **Fix round 1 (Task 6): a largura fixa (640px) original escondia
 * metade da janela de 6 meses no Android** (~390px de viewport, o
 * dispositivo PRIMÁRIO do dono pra registrar gasto — e `#/` virou o
 * default nesta mesma task, então é a PRIMEIRA coisa que ele vê). Trocado
 * por `window.innerWidth` + listener de `resize`: `ResponsiveContainer`
 * dependeria de `ResizeObserver` (ausente no jsdom dos testes, e não
 * renderiza filho nenhum sem medição real de container) — `innerWidth` e o
 * evento `resize`, ao contrário, são suportados nativamente pelo jsdom
 * (MEDIDO), então dá pra ficar responsivo E testável sem mockar nada
 * global em `src/test/setup.ts`. `overflow-x-auto` no container fica como
 * rede de segurança abaixo de `LARGURA_MINIMA`, não como estratégia
 * principal.
 */
function useLarguraGrafico(): number {
  const [largura, setLargura] = useState(larguraDoGrafico)
  useEffect(() => {
    const onResize = () => setLargura(larguraDoGrafico())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return largura
}

/**
 * Módulo separado de `BlocoComprometido.tsx` DE PROPÓSITO — é o arquivo
 * que carrega `recharts` (+104 KB gzip, medido), e só ele é importado via
 * `lazy()`/`import()` dinâmico. Um `import` estático de `recharts` no
 * bundle principal pesaria a primeira pintura da home inteira, mesmo pra
 * quem nunca rola até este bloco. `scripts/check-financas-lazy-chart.mjs`,
 * rodado no `build`, garante isso no bundle real — não é só convenção.
 */
export default function GraficoComprometido({
  report,
}: {
  report: CommitmentReportView
}) {
  const largura = useLarguraGrafico()
  const dados = report.competences.map((competence, i) => ({
    competence,
    rotulo: rotuloCompetencia(competence),
    total: report.totals[i],
    pct: report.pct_of_fixed_net[i],
  }))

  return (
    <div className="overflow-x-auto" data-testid="grafico-comprometido">
      <BarChart width={largura} height={ALTURA} data={dados}>
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
