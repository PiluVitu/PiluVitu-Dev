import {
  regraCasa,
  type Regra,
  type TransacaoParaRegras,
} from '@piluvitu/tools/regras'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'

/**
 * Categorização automática por REGRA — camada de domínio (migration 0009).
 *
 * ⚠️ **O MATCHER não mora aqui.** `regraCasa`/`aplicarRegras` vivem em
 * `@piluvitu/tools/regras` porque o Worker e a SPA precisam do MESMO
 * matcher e não há fronteira de import entre os dois bundles — detalhe
 * completo no cabeçalho daquele arquivo. Este arquivo é só CRUD sobre a
 * tabela + a contagem de casamentos, e a contagem REUSA `regraCasa` em vez
 * de reescrever o matching em SQL: duas implementações do mesmo matching
 * divergiriam, e o sintoma seria a tela prometer "13 lançamentos casariam"
 * e o import sugerir outra coisa, em silêncio.
 */

export type Rule = Regra

export type NewRule = {
  name: string
  match_text?: string | null
  match_account_id?: string | null
  match_min_cents?: number | null
  match_max_cents?: number | null
  match_direction?: 'expense' | 'income' | null
  set_category_id?: string | null
  set_payee_id?: string | null
  set_is_business?: 0 | 1 | null
  priority?: number
  active?: 0 | 1
}

export type RulePatch = Partial<{
  name: string
  match_text: string | null
  match_account_id: string | null
  match_min_cents: number | null
  match_max_cents: number | null
  match_direction: 'expense' | 'income' | null
  set_category_id: string | null
  set_payee_id: string | null
  set_is_business: 0 | 1 | null
  priority: number
  active: 0 | 1
}>

const COLUMNS = `id, name, match_text, match_account_id, match_min_cents,
  match_max_cents, match_direction, set_category_id, set_payee_id,
  set_is_business, priority, active, created_at, updated_at`

// Mesmo raciocínio de RECURRING_LIST_LIMIT: em regime normal são algumas
// dezenas de regras. O teto é defesa em profundidade — no D1 "rows read"
// cobra por linha ESCANEADA, então nenhuma query fica sem teto por
// princípio, mesmo quando o dado real nunca chega perto.
const RULES_LIST_LIMIT = 500

/**
 * Janela de lançamentos que `countRuleMatches` varre. NÃO é "todas as
 * transações": no D1 cada linha escaneada é cota, e esta contagem roda a
 * cada abertura da tela de regras. A tela DIZ o tamanho da janela em vez de
 * apresentar o número como se fosse o histórico inteiro — mesma honestidade
 * do teto de 500 da dedupe do import.
 */
export const MATCH_SCAN_LIMIT = 1000

// Campo de texto vazio vindo de um `<input>` não preenchido é AUSÊNCIA, não
// "case com string vazia" — o CHECK do schema recusaria `''` em
// `match_text`, e um id vazio quebraria a FK. Normalizar num lugar só
// mantém a rota burra (ela repassa o corpo) sem espalhar `|| null` por lá.
function ouNulo<T extends string>(v: T | null | undefined): T | null {
  return v === undefined || v === null || (v as string) === '' ? null : v
}

/** Campos comuns a `Rule`/`NewRule`/`RulePatch` depois de normalizados. */
type RegraNormalizada = Omit<Rule, 'id' | 'created_at' | 'updated_at'>

/**
 * Resolve todo `undefined`/`''` para `null` e aplica os defaults, produzindo
 * a linha que de fato será gravada. Validar a linha FINAL (e não o corpo
 * cru) é o que faz create e update dividirem exatamente a mesma regra.
 */
function normalizarRegra(input: NewRule, base?: Rule): RegraNormalizada {
  return {
    name: typeof input.name === 'string' ? input.name.trim() : input.name,
    match_text: ouNulo(input.match_text),
    match_account_id: ouNulo(input.match_account_id),
    match_min_cents: input.match_min_cents ?? null,
    match_max_cents: input.match_max_cents ?? null,
    match_direction: ouNulo(input.match_direction),
    set_category_id: ouNulo(input.set_category_id),
    set_payee_id: ouNulo(input.set_payee_id),
    set_is_business: input.set_is_business ?? null,
    priority: input.priority ?? base?.priority ?? 100,
    active: input.active ?? base?.active ?? 1,
  }
}

/**
 * TS valida ANTES do banco (padrão de createAccount/createRecurring/
 * setFixedNetCents): os CHECKs da 0009 pegam os mesmos casos, mas com
 * "CHECK constraint failed" cru, que não diz ao dono o que corrigir.
 *
 * As duas validações estruturais (pelo menos uma condição, pelo menos uma
 * ação) existem NOS DOIS lugares de propósito — aqui pela mensagem, no
 * schema porque uma linha escrita por fora (`wrangler d1 execute`) não
 * passa por este arquivo, e uma regra sem condição casaria TODO lançamento.
 */
function validateRule(r: RegraNormalizada): void {
  if (typeof r.name !== 'string' || r.name === '')
    throw new RangeError('name é obrigatório')

  for (const [campo, valor] of [
    ['match_min_cents', r.match_min_cents],
    ['match_max_cents', r.match_max_cents],
  ] as const) {
    if (valor === null) continue
    if (!Number.isInteger(valor) || valor <= 0)
      throw new RangeError(
        `${campo} inválido: ${valor} (esperado inteiro positivo em centavos)`,
      )
  }
  if (
    r.match_min_cents !== null &&
    r.match_max_cents !== null &&
    r.match_max_cents < r.match_min_cents
  )
    throw new RangeError(
      'match_max_cents precisa ser maior ou igual a match_min_cents',
    )

  if (
    r.match_direction !== null &&
    r.match_direction !== 'expense' &&
    r.match_direction !== 'income'
  )
    throw new RangeError("match_direction precisa ser 'expense' ou 'income'")

  if (
    r.set_is_business !== null &&
    r.set_is_business !== 0 &&
    r.set_is_business !== 1
  )
    throw new RangeError('set_is_business precisa ser 0, 1 ou nulo')

  if (!Number.isInteger(r.priority))
    throw new RangeError(`priority inválida: ${r.priority} (esperado inteiro)`)

  if (r.active !== 0 && r.active !== 1)
    throw new RangeError('active precisa ser 0 ou 1')

  const temCondicao =
    r.match_text !== null ||
    r.match_account_id !== null ||
    r.match_min_cents !== null ||
    r.match_max_cents !== null ||
    r.match_direction !== null
  if (!temCondicao)
    throw new RangeError(
      'a regra precisa de pelo menos uma condição (texto, conta, faixa de valor ou sinal) — sem nenhuma, ela casaria com todos os lançamentos',
    )

  const temAcao =
    r.set_category_id !== null ||
    r.set_payee_id !== null ||
    r.set_is_business !== null
  if (!temAcao)
    throw new RangeError(
      'a regra precisa de pelo menos uma ação (categoria, favorecido ou PJ/PF)',
    )
}

export async function createRule(
  db: D1Database,
  input: NewRule,
): Promise<Rule> {
  const normalizada = normalizarRegra(input)
  validateRule(normalizada)

  const now = nowIsoUtc()
  const row: Rule = {
    ...normalizada,
    id: newId(),
    created_at: now,
    updated_at: now,
  }

  await db
    .prepare(
      `INSERT INTO rules (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.name,
      row.match_text,
      row.match_account_id,
      row.match_min_cents,
      row.match_max_cents,
      row.match_direction,
      row.set_category_id,
      row.set_payee_id,
      row.set_is_business,
      row.priority,
      row.active,
      row.created_at,
      row.updated_at,
    )
    .run()

  return row
}

/**
 * Devolve TODAS as regras (ativas E pausadas) já na ordem de aplicação —
 * `priority, created_at, id`, os mesmos três critérios (e a mesma ordem) de
 * `ordenarRegras` em `@piluvitu/tools/regras`.
 *
 * ⚠️ O `ORDER BY` aqui é conveniência de LEITURA (a tela mostra as regras na
 * ordem em que rodam), NUNCA a garantia de ordem da aplicação — quem
 * ordena de verdade é `aplicarRegras`, sobre o array recebido, porque a SPA
 * também aplica regras sem passar por esta query.
 */
export async function listRules(
  db: D1Database,
  opts: { onlyActive?: boolean } = {},
): Promise<Rule[]> {
  const res = await db
    .prepare(
      `SELECT ${COLUMNS} FROM rules
        ${opts.onlyActive ? 'WHERE active = 1' : ''}
        ORDER BY priority, created_at, id
        LIMIT ?`,
    )
    .bind(RULES_LIST_LIMIT)
    .all<Rule>()
  return res.results
}

const PATCHABLE_FIELDS = [
  'name',
  'match_text',
  'match_account_id',
  'match_min_cents',
  'match_max_cents',
  'match_direction',
  'set_category_id',
  'set_payee_id',
  'set_is_business',
  'priority',
  'active',
] as const satisfies readonly (keyof RulePatch)[]

/**
 * Patch parcial por whitelist. Devolve `null` para id inexistente (mesma
 * convenção de updateRecurring/archiveAccount — a rota traduz em 404).
 *
 * ⚠️ **A validação roda sobre a linha FUNDIDA (atual + patch), não sobre o
 * patch sozinho** — e isso é o ponto. Um patch que limpa a única condição
 * (`{match_text: null}` numa regra que só tinha texto) é individualmente
 * inofensivo e produziria uma regra que casa TODO lançamento; validar só o
 * que veio no corpo deixaria passar exatamente esse caminho. Ler antes de
 * escrever custa um SELECT a mais numa tabela de dezenas de linhas.
 */
export async function updateRule(
  db: D1Database,
  id: string,
  patch: RulePatch,
): Promise<Rule | null> {
  const atual = await db
    .prepare(`SELECT ${COLUMNS} FROM rules WHERE id = ?`)
    .bind(id)
    .first<Rule>()
  if (!atual) return null

  const fields = PATCHABLE_FIELDS.filter((f) => f in patch)
  if (fields.length === 0) return atual

  // Normaliza e valida a linha FUNDIDA — `undefined` de um campo ausente no
  // patch nunca entra, porque a base já traz o valor atual.
  const fundida = normalizarRegra({ ...atual, ...patch } as NewRule, atual)
  validateRule(fundida)

  const set = fields.map((f) => `${f} = ?`).join(', ')
  // Grava o valor JÁ NORMALIZADO (string vazia virou null), não o cru do
  // corpo: `{match_text: ''}` gravaria um texto que o CHECK do schema
  // recusa, e `{set_category_id: ''}` quebraria a FK.
  const values = fields.map((f) => fundida[f] ?? null)

  const res = await db
    .prepare(`UPDATE rules SET ${set}, updated_at = ? WHERE id = ?`)
    .bind(...values, nowIsoUtc(), id)
    .run()
  if (res.meta.changes === 0) return null

  return db
    .prepare(`SELECT ${COLUMNS} FROM rules WHERE id = ?`)
    .bind(id)
    .first<Rule>()
}

/**
 * DELETE de verdade, não soft-delete: NADA aponta pra `rules` (o que fica
 * gravado no lançamento é a categoria, nunca um `rule_id`), então apagar
 * não deixa órfão. Pausar sem perder o texto é o que `active = 0` faz.
 * Mesmo precedente de `deleteRecurring`.
 */
export async function deleteRule(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare('DELETE FROM rules WHERE id = ?').bind(id).run()
  return res.meta.changes > 0
}

export type RuleMatchCounts = {
  /** quantos lançamentos foram de fato varridos (o tamanho da janela) */
  scanned: number
  /** rule_id -> quantos daqueles lançamentos a regra casaria */
  counts: Record<string, number>
}

/**
 * Quantos lançamentos EXISTENTES cada regra casaria.
 *
 * ⚠️ **Por que isto é servidor e não cliente:** a resposta precisa olhar o
 * livro-caixa inteiro (até o teto), e a SPA só tem em mãos a página do
 * extrato que ela carregou. Mas a contagem NÃO reescreve o matching em SQL
 * — carrega os lançamentos e roda `regraCasa`, a MESMA função que o import
 * usa pra sugerir. Um `LIKE '%'||?||'%'` em SQL seria uma segunda
 * implementação: sem normalização de acento, com semântica de `LIKE`
 * (curinga `%`/`_` dentro do texto do dono) e sem a faixa em magnitude —
 * três jeitos de divergir do que a tela de import de fato vai fazer.
 *
 * Uma varredura, N regras: as regras são dezenas, os lançamentos milhares,
 * então o custo é UMA leitura bounded, não uma por regra.
 */
export async function countRuleMatches(
  db: D1Database,
  rules: Rule[],
  opts: { limit?: number } = {},
): Promise<RuleMatchCounts> {
  const limit = opts.limit ?? MATCH_SCAN_LIMIT
  const counts: Record<string, number> = {}
  for (const r of rules) counts[r.id] = 0
  if (rules.length === 0) return { scanned: 0, counts }

  // Os mesmos dois filtros anti-dupla-contagem de v_cashflow/byCategory:
  // perna de transferência e filha de rateio repetem valor de outra linha,
  // e contá-las inflaria o número que o dono usa pra decidir se confia na
  // regra. `purchase_date DESC` + LIMIT = a janela MAIS RECENTE, que é a
  // que se parece com o que ele vai importar amanhã.
  const res = await db
    .prepare(
      `SELECT description, amount_cents, account_id
         FROM transactions
        WHERE transfer_id IS NULL AND parent_id IS NULL
        ORDER BY purchase_date DESC, created_at DESC, id DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all<TransacaoParaRegras>()

  for (const tx of res.results) {
    for (const r of rules) if (regraCasa(r, tx)) counts[r.id]++
  }

  return { scanned: res.results.length, counts }
}
