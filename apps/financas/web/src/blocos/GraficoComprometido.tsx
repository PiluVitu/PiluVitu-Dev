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
import type { ByCategoryReportView } from '../lib/categories'

/** Acima disso, metade da renda fixa já está comprometida — mesmo limiar de `commitments.tsx`. */
const LIMIAR_ALERTA_PCT = 50

// Tokens do design system (@piluvitu/ui/styles.css), nunca hex solto — é o
// que faz o dark mode funcionar sem tocar neste arquivo (Task 6, requisito
// explícito do brief).
const COR_ALERTA = 'hsl(var(--destructive))'
const COR_PADRAO = 'hsl(var(--primary))'
const COR_REFERENCIA = 'hsl(var(--muted-foreground))'
// Reusa o mesmo token de COR_REFERENCIA (não é coincidência: os dois marcam
// "informativo, não é o dado principal") — a barra "Sem categoria" do
// GraficoCategorias, mais abaixo neste arquivo.
const COR_SEM_CATEGORIA = 'hsl(var(--muted-foreground))'

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
 * Módulo separado dos `Bloco*.tsx` DE PROPÓSITO — é o arquivo que carrega
 * `recharts` (+104 KB gzip, medido), e só ele é importado via
 * `lazy()`/`import()` dinâmico. Um `import` estático de `recharts` no
 * bundle principal pesaria a primeira pintura da home inteira, mesmo pra
 * quem nunca rola até um bloco com gráfico. `scripts/check-financas-lazy-chart.mjs`,
 * rodado no `build`, garante isso no bundle real — não é só convenção.
 *
 * ⚠️ **Task 8: `GraficoCategorias` (mais abaixo neste arquivo) mora AQUI,
 * não num arquivo `GraficoCategorias.tsx` separado — de propósito.** É a
 * mesma razão do parágrafo acima, só que entre DOIS gráficos: um segundo
 * arquivo importando `recharts` criaria um SEGUNDO chunk de ~104 KB gzip
 * pro mesmo pacote, carregado quando o bloco Categorias monta — peso
 * duplicado por um código (o `recharts` em si) que é idêntico nos dois
 * casos. `BlocoCategorias.tsx` faz
 * `lazy(() => import('./GraficoComprometido').then(m => ({ default: m.GraficoCategorias })))`
 * — o `import()` resolve pro MESMO módulo/chunk físico que
 * `BlocoComprometido.tsx` já carrega sob demanda, nunca um segundo.
 * `scripts/check-financas-lazy-chart.mjs` continua válido sem alteração:
 * ele verifica "o marcador de recharts está fora do chunk de entrada e
 * dentro de ALGUM chunk lazy", não quantos chunks lazy existem — dois
 * componentes cujo `import()` aponta pro mesmo arquivo produzem um chunk
 * só (medido no build desta task, ver task-8-report.md).
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

// Altura por linha de categoria + um piso mínimo — a lista cresce com o
// número de categorias em vez de espremer tudo numa altura fixa (hoje só
// existem 7 categorias semeadas + "Sem categoria", então na prática nunca
// passa de ~8 linhas — ver CLAUDE.md § Relatório por categoria).
const ALTURA_LINHA_CATEGORIA = 32
const ALTURA_MINIMA_CATEGORIAS = 120
// Largura reservada pro rótulo (nome da categoria) no eixo Y — nomes como
// "DAS — Simples Nacional" precisam de mais espaço que os 72px usados pro
// eixo Y numérico de GraficoComprometido acima.
const LARGURA_ROTULO_CATEGORIA = 108

/**
 * "Para onde foi o dinheiro" (Task 8) — barras HORIZONTAIS, uma por
 * categoria, maior gasto primeiro. `report.rows` já vem ordenado
 * (`total_cents ASC` no Worker — mais negativo, ou seja, MAIOR despesa,
 * primeiro; ver `src/domain/reports.ts#byCategory`), este componente não
 * reordena.
 *
 * Horizontal, não vertical como `GraficoComprometido` acima: nomes de
 * categoria em português ("DAS — Simples Nacional", "Sem categoria") não
 * cabem como rótulo de eixo X num viewport de ~326px sem girar o texto — a
 * mesma lição de largura da Task 6 (fix round 1), aplicada aqui de outro
 * jeito: eixo Y categórico (`layout="vertical"` do recharts — a nomenclatura
 * dele é invertida: "vertical" = barras HORIZONTAIS, categoria no eixo Y)
 * lê melhor a 390px do que rótulos inclinados ou cortados.
 *
 * Paleta: não usa uma cor por categoria — só duas (`COR_PADRAO` pra
 * categoria real, `COR_SEM_CATEGORIA` pro bucket agregado). Nº de
 * categorias hoje é pequeno e curado (7 seedadas + "Sem categoria", ver
 * CLAUDE.md), então uma paleta categórica de N cores não ganha nada em
 * legibilidade sobre a ORDEM (maior gasto primeiro) + o rótulo por extenso
 * — e evita ter que inventar uma paleta acessível pra daltonismo sem
 * token nenhum do design system pra isso (`packages/ui/src/styles.css` não
 * tem tokens `--chart-N`).
 *
 * ⚠️ Discrimina "Sem categoria" por `category_id === null` — NUNCA por
 * `category_name`/`category_slug` (ver `lib/categories.ts` pro motivo:
 * `categories.slug` é nullable, uma categoria REAL do usuário pode ter
 * slug nulo).
 */
export function GraficoCategorias({
  report,
}: {
  report: ByCategoryReportView
}) {
  const largura = useLarguraGrafico()
  const dados = report.rows.map((r) => ({
    id: r.category_id ?? 'sem-categoria',
    nome: r.category_name,
    valor: Math.abs(r.total_cents),
    semCategoria: r.category_id === null,
  }))
  const altura = Math.max(
    ALTURA_MINIMA_CATEGORIAS,
    dados.length * ALTURA_LINHA_CATEGORIA + 40,
  )

  return (
    <div className="overflow-x-auto" data-testid="grafico-categorias">
      <BarChart
        width={largura}
        height={altura}
        data={dados}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
      >
        <XAxis
          type="number"
          fontSize={12}
          tickFormatter={(v: number) => formatBRL(v)}
        />
        <YAxis
          type="category"
          dataKey="nome"
          width={LARGURA_ROTULO_CATEGORIA}
          fontSize={11}
        />
        <Tooltip formatter={(v) => formatBRL(Number(v))} />
        <Bar dataKey="valor" isAnimationActive={false}>
          {dados.map((d) => (
            <Cell
              key={d.id}
              fill={d.semCategoria ? COR_SEM_CATEGORIA : COR_PADRAO}
            />
          ))}
        </Bar>
      </BarChart>
    </div>
  )
}
