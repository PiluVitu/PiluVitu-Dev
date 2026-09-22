import { addMonthsToCompetence, nowIsoUtc } from '../lib/dates'
import { logConstraintError } from '../lib/errors'
import { newId } from '../lib/ids'
import { byCategory, type CategoryRow } from './reports'

/**
 * Insight: fatia ⑨, Task 3 (docs/superpowers/specs/2026-07-28-financas-ui-insights-design.md
 * §3). Guarda só a PROSA gerada pelo Ollama local, sobre um período — nunca
 * um número. Os números que a leitura descreve vêm de `insightNumbers`
 * (abaixo), que não lê esta tabela.
 */
export type Insight = {
  id: string
  texto: string
  modelo: string
  periodo: string
  generated_at: string
}

export type NewInsight = {
  texto: string
  modelo: string
  periodo: string
}

/**
 * Grava o texto gerado pelo modelo. `generated_at` é do SERVIDOR
 * (nowIsoUtc()) — nunca aceito do chamador: "frescor, não silêncio" (spec
 * §3) depende de um relógio confiável, e o relógio de quem faz o POST (o
 * Mac do dono, atrás de um comando manual) não é essa fonte. `NewInsight`
 * nem tem campo pra isso — a rota (routes/insights.ts) não repassa nada do
 * corpo além de texto/modelo/periodo, mesmo que o corpo mande outra coisa.
 */
export async function createInsight(
  db: D1Database,
  input: NewInsight,
): Promise<Insight> {
  const texto = input.texto.trim()
  const modelo = input.modelo.trim()
  // addMonthsToCompetence(x, 0) valida o formato 'YYYY-MM' (lança
  // RangeError se ausente/malformado) e devolve a mesma competência —
  // mesma técnica de reports.ts#byCategory, nunca uma regex nova.
  const periodo = addMonthsToCompetence(input.periodo, 0)

  if (texto.length === 0) {
    throw new RangeError('texto do insight não pode ser vazio')
  }
  if (modelo.length === 0) {
    throw new RangeError('modelo do insight não pode ser vazio')
  }

  const insight: Insight = {
    id: newId(),
    texto,
    modelo,
    periodo,
    generated_at: nowIsoUtc(),
  }

  await db
    .prepare(
      `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      insight.id,
      insight.texto,
      insight.modelo,
      insight.periodo,
      insight.generated_at,
    )
    .run()

  return insight
}

/**
 * O insight mais recente por `generated_at`, ou `null` quando o comando do
 * Mac nunca rodou — caso NORMAL, não erro (spec §3: a tela mostra os
 * números sempre, mesmo sem nunca ter rodado o comando).
 *
 * Mesma defesa já documentada em `domain/settings.ts#getFixedNetCents`
 * (achado CRITICAL C2 de uma revisão anterior deste módulo): se
 * `wrangler deploy` rodar ANTES de `wrangler d1 migrations apply --remote`
 * pra `0007_insights.sql`, este SELECT bateria contra uma tabela
 * inexistente. Como "tabela ainda não existe" e "comando do Mac nunca
 * rodou" são, do ponto de vista de quem LÊ, o MESMO estado (nenhum
 * insight disponível ainda), degradar pra `null` em vez de propagar o
 * erro cru é correto aqui — não é só defesa em profundidade, é a resposta
 * certa pro caso. A ordem migration-antes-de-deploy continua sendo a
 * regra (ver CLAUDE.md/"Deploy" § 2).
 */
export async function latestInsight(db: D1Database): Promise<Insight | null> {
  let row: Insight | null
  try {
    row = await db
      .prepare(
        `SELECT id, texto, modelo, periodo, generated_at
           FROM insights
          ORDER BY generated_at DESC
          LIMIT 1`,
      )
      .first<Insight>()
  } catch (err) {
    logConstraintError('latestInsight', String(err))
    return null
  }
  return row ?? null
}

/** Top N categorias — mesmo teto de leitura de outras listas pequenas do módulo. */
export const TOP_CATEGORIES_LIMIT = 5

export type InsightNumbers = {
  competence: string
  previous_competence: string
  /** Maiores despesas do período — os N primeiros de byCategory(), sem reordenar. */
  top_categories: CategoryRow[]
  total_cents: number
  /** Só `is_business = 0` — o gasto pessoal. Mesmo sinal cru de `total_cents`. */
  total_pf_cents: number
  /** Só `is_business = 1` — o gasto da empresa. Mesmo sinal cru. */
  total_pj_cents: number
  previous_total_cents: number
  /** |current| - |previous|. Positivo = gastou mais que no período anterior. */
  variation_cents: number
  /** null quando o período anterior não teve gasto nenhum (divisão por zero evitada). */
  variation_pct: number | null
  /** Mesma conta de `variation_cents`, só sobre `is_business = 0`. */
  variation_pf_cents: number
  /** Mesma conta de `variation_pct`, só sobre `is_business = 0`. */
  variation_pf_pct: number | null
  biggest_increase: {
    category_id: string | null
    category_name: string
    category_slug: string | null
    current_cents: number
    previous_cents: number
    /** |current| - |previous| da PRÓPRIA categoria. Positivo = cresceu. */
    delta_cents: number
  } | null
}

/**
 * Os fatos calculados sobre o período: top categorias, variação contra o
 * período anterior, e o que mais cresceu. Consulta EXATA, sem AI — reusa
 * `byCategory` (domain/reports.ts) pros dois períodos em vez de escrever
 * uma segunda regra de agregação que pudesse divergir dela. Não lê a
 * tabela `insights`: funciona igual, com o mesmo resultado, quer o comando
 * do Mac já tenha rodado alguma vez ou não.
 */
// UMA query agregada em vez de duas chamadas extras a byCategory(): o mesmo
// predicado (despesa, sem perna de transferencia, sem filha de rateio), so
// que quebrado por is_business. byCategory corta em BY_CATEGORY_LIMIT (500)
// e este SUM nao — divergiriam se um mes tivesse mais de 500 categorias,
// cenario que este livro-caixa nao alcanca.
async function totaisPorEscopo(
  db: D1Database,
  competence: string,
): Promise<{ total_pf_cents: number; total_pj_cents: number }> {
  const from = `${competence}-01`
  const to = `${addMonthsToCompetence(competence, 1)}-01`
  const res = await db
    .prepare(
      `SELECT t.is_business AS escopo, SUM(t.amount_cents) AS total_cents
         FROM transactions t
        WHERE t.purchase_date >= ?
          AND t.purchase_date <  ?
          AND t.amount_cents  <  0
          AND t.transfer_id   IS NULL
          AND t.parent_id     IS NULL
        GROUP BY t.is_business`,
    )
    .bind(from, to)
    .all<{ escopo: number; total_cents: number }>()

  let total_pf_cents = 0
  let total_pj_cents = 0
  for (const linha of res.results) {
    if (linha.escopo === 1) total_pj_cents = linha.total_cents
    else total_pf_cents = linha.total_cents
  }
  return { total_pf_cents, total_pj_cents }
}

// "Quanto subiu contra o periodo anterior" e pergunta sobre MAGNITUDE de
// gasto: os dois lados chegam negativos, e usar o valor cru inverteria o
// sinal (gastar mais viraria variacao negativa). Extraida pra que a versao
// combinada e a de PF nao possam divergir.
function variacao(
  atual_cents: number,
  anterior_cents: number,
): { variation_cents: number; variation_pct: number | null } {
  const atual = Math.abs(atual_cents)
  const anterior = Math.abs(anterior_cents)
  const variation_cents = atual - anterior
  return {
    variation_cents,
    variation_pct:
      anterior !== 0 ? Math.round((variation_cents * 100) / anterior) : null,
  }
}

export async function insightNumbers(
  db: D1Database,
  opts: { competence: string },
): Promise<InsightNumbers> {
  const competence = addMonthsToCompetence(opts.competence, 0)
  const previous_competence = addMonthsToCompetence(competence, -1)

  const [current, previous] = await Promise.all([
    byCategory(db, { competence }),
    byCategory(db, { competence: previous_competence }),
  ])

  const top_categories = current.rows.slice(0, TOP_CATEGORIES_LIMIT)

  // total_cents/previous_total_cents ficam com o MESMO sinal cru de
  // byCategory (negativo — reuso direto, sem reinterpretar). variation_*
  // é derivado a partir da MAGNITUDE (Math.abs) de cada lado: positivo
  // quando o gasto cresceu, negativo quando encolheu — "quanto subiu
  // contra o período anterior" (brief) é uma pergunta sobre magnitude de
  // gasto, e usar o total_cents cru (negativo) inverteria o sinal do
  // resultado (gastar MAIS viraria uma variação NEGATIVA).
  const total_cents = current.total_cents
  const [
    { total_pf_cents, total_pj_cents },
    { total_pf_cents: previous_pf_cents },
  ] = await Promise.all([
    totaisPorEscopo(db, competence),
    totaisPorEscopo(db, previous_competence),
  ])
  const previous_total_cents = previous.total_cents
  const { variation_cents, variation_pct } = variacao(
    total_cents,
    previous_total_cents,
  )
  const {
    variation_cents: variation_pf_cents,
    variation_pct: variation_pf_pct,
  } = variacao(total_pf_cents, previous_pf_cents)

  // "O que mais cresceu": maior aumento de MAGNITUDE de gasto por
  // categoria (positivo = cresceu, mesma convenção de variation_cents
  // acima), comparando o MESMO category_id entre os dois períodos.
  // Categoria ausente no período anterior conta como previous_cents = 0
  // (cresceu do zero) — nunca ignorada. Categoria que só existia no
  // período ANTERIOR (gasto zerou agora) não entra: não está "crescendo".
  const previousByCategory = new Map(
    previous.rows.map((r) => [r.category_id, r]),
  )
  let biggest_increase: InsightNumbers['biggest_increase'] = null
  for (const row of current.rows) {
    const prevRow = previousByCategory.get(row.category_id)
    const previous_cents = prevRow?.total_cents ?? 0
    const delta_cents = Math.abs(row.total_cents) - Math.abs(previous_cents)
    if (
      biggest_increase === null ||
      delta_cents > biggest_increase.delta_cents
    ) {
      biggest_increase = {
        category_id: row.category_id,
        category_name: row.category_name,
        category_slug: row.category_slug,
        current_cents: row.total_cents,
        previous_cents,
        delta_cents,
      }
    }
  }

  return {
    competence,
    previous_competence,
    top_categories,
    total_cents,
    total_pf_cents,
    total_pj_cents,
    previous_total_cents,
    variation_cents,
    variation_pct,
    variation_pf_cents,
    variation_pf_pct,
    biggest_increase,
  }
}
