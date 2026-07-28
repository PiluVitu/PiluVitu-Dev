import { formatBRL } from '@piluvitu/tools/money'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@piluvitu/ui/chart'
import { useEffect, useRef, useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CashflowReportView } from '../lib/cashflow'
import { LIMIAR_ALERTA_PCT, rotuloCompetencia } from '../lib/commitments'
import type { CommitmentReportView } from '../lib/commitments'
import type { ByCategoryReportView } from '../lib/categories'

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
// GraficoFluxo (Task 3, fatia ⑧): entrou reusa o mesmo token "normal"
// (--primary) de GraficoComprometido; saiu reusa o token de alerta
// (--destructive) — não por risco de teto, mas porque vermelho já é o
// significado que este app deu a "dinheiro saindo" em toda outra tela.
// Nenhum token novo, mesma disciplina de cor do resto do arquivo.
const COR_ENTROU = COR_PADRAO
const COR_SAIU = COR_ALERTA

const ALTURA = 220
const LARGURA_MAXIMA = 640

/**
 * Largura do gráfico acompanhando o CONTAINER, não a janela — SEM
 * `ResponsiveContainer` (que dependeria do mesmo `ResizeObserver` que este
 * hook usa, só que sem dar acesso ao `<div>` real pra medir).
 *
 * ⚠️ **Important 1 (fix final): medir `window.innerWidth` (Task 6, fix
 * round 1) resolvia o problema ERRADO.** Isso ficava certo enquanto a home
 * tinha 1 coluna só — a partir da Task 7 (grid `md:grid-cols-2`), o card
 * que contém o gráfico é MENOR que a janela, e uma largura calculada
 * contra `window.innerWidth - margem` ignora completamente o grid.
 * MEDIDO em 1280×900 com dado semeado: `clientWidth` do container = 262px,
 * SVG do gráfico = 640px — 2,4× mais largo que o espaço real, escondendo
 * 4 dos 6 meses da janela atrás de um scroll horizontal sem indicação
 * nenhuma, na tela cuja finalidade é justamente ver a janela inteira "de
 * relance". Em 390px (Android): 308 vs 326 — diferença menor, mesmo
 * defeito.
 *
 * Trocado por um `ref` no PRÓPRIO wrapper (`overflow-x-auto`) +
 * `ResizeObserver` — stubado em `src/test/setup.ts` (a ausência dele no
 * jsdom era exatamente o motivo documentado pra evitar esta abordagem na
 * Task 6; o stub resolve isso). Mede o wrapper, não o `BarChart`: um
 * elemento de bloco sem largura própria preenche o espaço disponível do
 * pai (`CardContent`) independente do filho, então não há circularidade
 * em medir o mesmo elemento que recebe a largura calculada.
 *
 * **Sem piso mínimo artificial** (o antigo `LARGURA_MINIMA = 280` sumiu):
 * um piso que empurrasse a largura pra CIMA da medida real do container
 * reintroduziria o mesmo estouro que este fix existe pra eliminar — se o
 * container é mesmo mais estreito que isso, `overflow-x-auto` continua
 * como rede de segurança, não como estratégia principal (documentado
 * desde a Task 6).
 */
function useLarguraContainer<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>
  largura: number
} {
  const ref = useRef<T>(null)
  const [largura, setLargura] = useState(LARGURA_MAXIMA)

  useEffect(() => {
    const elemento = ref.current
    if (!elemento || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const larguraMedida = entries[0]?.contentRect.width
      if (larguraMedida !== undefined && larguraMedida > 0) {
        setLargura(Math.min(LARGURA_MAXIMA, larguraMedida))
      }
    })
    observer.observe(elemento)
    return () => observer.disconnect()
  }, [])

  return { ref, largura }
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
/**
 * Task 6 (fatia ⑥, §5 do spec): `total`/`pct` viraram FAIXA {min,max} — a
 * barra precisa representar um INTERVALO, não um valor único. Duas `<Bar>`
 * EMPILHADAS (mesmo `stackId`) fazem isso sem depender de nenhuma feature
 * de "range bar" que o recharts não tem: a primeira (`min`) vai de 0 até o
 * piso garantido; a segunda (`faixaAdicional` = max − min) empilha por
 * cima, indo do piso até o teto — visualmente uma barra "flutuando" entre
 * min e max.
 *
 * ⚠️ Isto também resolve o caso degenerado (min === max, a maioria das
 * competências — nenhuma recorrente em faixa cadastrada nelas) sem nenhum
 * `if` especial: `faixaAdicional` fica 0, e uma barra de valor EXATAMENTE 0
 * não renderiza `<path class="recharts-rectangle">` nenhum (MEDIDO,
 * recharts 3.10.1 — mesmo achado já documentado mais abaixo neste arquivo,
 * pro `GraficoCategorias`). Resultado: só a barra `min` aparece, sólida —
 * exatamente "um número, não um intervalo repetido", a mesma regra que
 * `lib/commitments.ts#formatRange` aplica no texto.
 *
 * Cor decidida pelo TETO (`pct.max`), nunca pelo piso — mesma regra do
 * alerta de 50% em `pages/commitments.tsx`: a tela existe pra mostrar
 * risco, e o pior mês é o risco. O segmento `faixaAdicional` usa a MESMA
 * cor do segmento `min` (nunca um hex novo), só com `fillOpacity` reduzida
 * — marca visualmente "isto é o adicional incerto", sem inventar um token
 * novo que o design system não tem.
 */
const COR_FAIXA_OPACIDADE = 0.45

export default function GraficoComprometido({
  report,
}: {
  report: CommitmentReportView
}) {
  const { ref, largura } = useLarguraContainer<HTMLDivElement>()
  const dados = report.competences.map((competence, i) => ({
    competence,
    rotulo: rotuloCompetencia(competence),
    min: report.totals[i].min,
    faixaAdicional: report.totals[i].max - report.totals[i].min,
    max: report.totals[i].max,
    pctMax: report.pct_of_fixed_net[i].max,
  }))

  return (
    <div
      ref={ref}
      className="overflow-x-auto"
      data-testid="grafico-comprometido"
    >
      <BarChart width={largura} height={ALTURA} data={dados}>
        <XAxis dataKey="rotulo" fontSize={12} />
        <YAxis
          width={72}
          fontSize={12}
          tickFormatter={(v: number) => formatBRL(v)}
        />
        <Tooltip
          formatter={(_value, name, item) => {
            const payload = item.payload as { min: number; max: number }
            return name === 'Piso'
              ? [formatBRL(payload.min), 'Piso']
              : [formatBRL(payload.max), 'Até o teto']
          }}
        />
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
        <Bar
          dataKey="min"
          name="Piso"
          stackId="total"
          isAnimationActive={false}
        >
          {dados.map((d) => (
            <Cell
              key={`${d.competence}-min`}
              fill={d.pctMax > LIMIAR_ALERTA_PCT ? COR_ALERTA : COR_PADRAO}
            />
          ))}
        </Bar>
        <Bar
          dataKey="faixaAdicional"
          name="Até o teto"
          stackId="total"
          isAnimationActive={false}
        >
          {dados.map((d) => (
            <Cell
              key={`${d.competence}-faixa`}
              fill={d.pctMax > LIMIAR_ALERTA_PCT ? COR_ALERTA : COR_PADRAO}
              fillOpacity={COR_FAIXA_OPACIDADE}
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
  const { ref, largura } = useLarguraContainer<HTMLDivElement>()
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
    <div ref={ref} className="overflow-x-auto" data-testid="grafico-categorias">
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

// Id único do gradiente do preenchimento da área — precisa ser único na
// página inteira (SVG `<defs>` compartilha namespace global de ids), não só
// neste componente. `GraficoFluxo` é o único consumidor de `<defs>` neste
// arquivo (os outros dois gráficos não usam `<Area>`), então um literal
// fixo é seguro.
const ID_GRADIENTE_ACUMULADO = 'fluxo-acumulado-gradiente'

// `ChartConfig` do shadcn (`@piluvitu/ui/chart`) — a MESMA cor de sempre
// pra entrou/saiu (tokens diretos, ver COR_ENTROU/COR_SAIU acima; o `<Bar
// fill=...>` abaixo continua usando o valor js direto, não a var CSS, pra
// não mexer na asserção de cor já testada). `acumulado` é quem de fato
// CONSOME a var CSS que `ChartContainer`/`ChartStyle` injeta
// (`var(--color-acumulado)`, tanto no `stroke` da área quanto no gradiente
// do preenchimento) — é a série nova desta task, a primeira do arquivo a
// usar o mecanismo de cor do componente `chart` do shadcn de verdade.
// `--chart-1` (não `--primary`/`--destructive`): o acumulado não carrega
// sentido de risco/status como as barras de entrada/saída — é só "a
// reserva ao longo do tempo", a cor neutra que o design system reserva pra
// gráfico (ver packages/ui/src/styles.css).
const chartConfigFluxo = {
  entrou: { label: 'Entrou', color: COR_ENTROU },
  saiu: { label: 'Saiu', color: COR_SAIU },
  acumulado: { label: 'Acumulado', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig

/**
 * Linha do tooltip com indicador + nome + valor em BRL — o MESMO layout que
 * `ChartTooltipContent` desenha por padrão, só trocando `value.toLocaleString()`
 * (o default do shadcn) por `formatBRL`, porque os valores aqui são
 * centavos inteiros, não reais formatados sozinhos. Passado como
 * `formatter` pra `ChartTooltipContent` — quando esse prop existe, o
 * componente delega a linha INTEIRA pra ele (perde o indicador/nome default
 * se o formatter não os desenhar de novo), daí reconstruir os dois aqui.
 */
export function formatarLinhaTooltipFluxo(
  value: unknown,
  name: unknown,
  item: { color?: string; payload?: { fill?: string } },
) {
  const cor = item.payload?.fill ?? item.color
  return (
    <>
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: cor }}
      />
      <div className="flex flex-1 items-center justify-between gap-4 leading-none">
        <span className="text-muted-foreground">{String(name)}</span>
        <span className="text-foreground font-mono font-medium tabular-nums">
          {formatBRL(Number(value))}
        </span>
      </div>
    </>
  )
}

/**
 * Mapa de fluxo de caixa (Task 3, fatia ⑧; area chart do acumulado — Task 1,
 * fatia ⑨) — barras de entrada/saída + ÁREA do acumulado. Mora NESTE
 * arquivo, não em `GraficoFluxo.tsx` separado — mesma razão de
 * `GraficoCategorias` acima: um terceiro arquivo importando `recharts`
 * criaria um TERCEIRO chunk de ~104 KB gzip pro mesmo pacote.
 * `pages/fluxo.tsx` resolve
 * `lazy(() => import('../blocos/GraficoComprometido').then(m => ({
 * default: m.GraficoFluxo })))` — o MESMO chunk físico que
 * `BlocoComprometido.tsx`/`BlocoCategorias.tsx` já carregam sob demanda,
 * nunca um novo. `@piluvitu/ui/chart` (novo nesta task) também importa
 * `recharts` — mas só é importado DAQUI, dentro do mesmo módulo lazy, então
 * o `import()` continua resolvendo pro MESMO chunk físico, nunca um
 * segundo. `scripts/check-financas-lazy-chart.mjs` continua válido sem
 * alteração — o gate verifica "o marcador de recharts está fora do chunk
 * de entrada e dentro de ALGUM chunk lazy", não quantos gráficos moram
 * nesse chunk (MEDIDO no build desta task, ver task-1-report.md).
 *
 * ⚠️ **Área, não linha — é o pedido literal do dono** (ele apontou pro
 * `https://ui.shadcn.com/charts/area`): a leitura de "a reserva subindo ou
 * sendo consumida ao longo do tempo" é o que área comunica melhor que uma
 * linha solta — o preenchimento sob a curva dá peso visual à ACUMULAÇÃO,
 * não só à trajetória. Entrou/saiu continuam como `<Bar>` (não viraram
 * área) — são fluxos discretos por mês, não uma grandeza que se acumula.
 *
 * ⚠️ **Container: `ChartContainer` (shadcn) + `ResponsiveContainer`
 * (recharts) — não o hook `useLarguraContainer` que os outros dois gráficos
 * deste arquivo usam.** Decisão desta task, não descuido: `ChartContainer`
 * já embute `ResponsiveContainer` (não dá pra optar por fora sem deixar de
 * ser o componente shadcn de verdade) — então este gráfico específico
 * adota o padrão CANÔNICO do shadcn (o mesmo de
 * `https://ui.shadcn.com/charts/area`), enquanto `GraficoComprometido`/
 * `GraficoCategorias` (não tocados nesta task) continuam com o hook manual
 * já testado. Os dois padrões coexistem no mesmo arquivo de propósito —
 * convergir os três pra um só é trabalho de uma task futura, não desta.
 *
 * Eixo único (não dual): entrou/saiu/acumulado convivem na mesma escala de
 * centavos, e este app é de uso pessoal — a diferença de magnitude entre
 * um mês e o acumulado não chega a justificar um segundo eixo.
 *
 * ⚠️ Mesmo achado MEDIDO já documentado acima (GraficoComprometido/
 * GraficoCategorias): uma barra de valor EXATAMENTE 0 não renderiza
 * `<path class="recharts-rectangle">` nenhum — um mês sem movimento
 * (`entrou_cents === 0 && saiu_cents === 0`, o caso "mês vazio aparece
 * zerado" do spec) simplesmente não desenha barra de entrada/saída
 * naquele mês, mas a ÁREA do acumulado continua (o acumulado migra o
 * saldo do mês anterior, nunca zera — ver `domain/cashflow.ts`). A prova
 * textual de "mês vazio aparece zerado, não ausente" mora na TABELA de
 * `pages/fluxo.tsx` (não sofre dessa peculiaridade do recharts), não
 * neste componente.
 */
export function GraficoFluxo({ report }: { report: CashflowReportView }) {
  const dados = report.linhas.map((l) => ({
    competence: l.competence,
    rotulo: rotuloCompetencia(l.competence),
    entrou: l.entrou_cents,
    saiu: l.saiu_cents,
    acumulado: l.acumulado_cents,
  }))

  return (
    <ChartContainer
      config={chartConfigFluxo}
      data-testid="grafico-fluxo"
      className="aspect-auto h-[220px] w-full"
    >
      <ComposedChart data={dados}>
        <defs>
          <linearGradient
            id={ID_GRADIENTE_ACUMULADO}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="5%"
              stopColor="var(--color-acumulado)"
              stopOpacity={0.35}
            />
            <stop
              offset="95%"
              stopColor="var(--color-acumulado)"
              stopOpacity={0.03}
            />
          </linearGradient>
        </defs>
        <XAxis dataKey="rotulo" fontSize={12} />
        <YAxis
          width={72}
          fontSize={12}
          tickFormatter={(v: number) => formatBRL(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={formatarLinhaTooltipFluxo} />
          }
        />
        <Bar
          dataKey="entrou"
          name="Entrou"
          fill={COR_ENTROU}
          isAnimationActive={false}
        />
        <Bar
          dataKey="saiu"
          name="Saiu"
          fill={COR_SAIU}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="acumulado"
          name="Acumulado"
          stroke="var(--color-acumulado)"
          strokeWidth={2}
          fill={`url(#${ID_GRADIENTE_ACUMULADO})`}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
