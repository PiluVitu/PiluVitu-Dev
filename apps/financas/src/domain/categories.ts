import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import type { Scope } from './accounts'

/**
 * Categorias — CRUD sobre a tabela `categories` da migration 0001.
 *
 * ⚠️ O PROBLEMA que este arquivo existe pra resolver, medido na produção
 * real: o dono tinha 7 categorias (as semeadas pela migration) e NENHUMA
 * forma de criar a oitava — `routes/categories.ts` só tinha `GET /`. Ele não
 * conseguia registrar "Mercado", "Gasolina", "Almoço". ZERO migration é
 * necessária: `parent_id`, `slug`, `default_scope` e `archived_at` já existem
 * no schema desde o `0001`; o que faltava era código que os escrevesse.
 *
 * Toda função recebe o `D1Database` por parâmetro (nunca lê `env` global) —
 * convenção do módulo, é o que deixa os testes rodarem contra o D1 do
 * Miniflare sem subir o Worker.
 */

export type CategoryKind = 'income' | 'expense' | 'transfer' | 'debt_settlement'

export const CATEGORY_KINDS: CategoryKind[] = [
  'income',
  'expense',
  'transfer',
  'debt_settlement',
]

export type Category = {
  id: string
  parent_id: string | null
  name: string
  kind: CategoryKind
  slug: string | null
  default_scope: Scope | null
  archived_at: string | null
  created_at: string
}

/**
 * ⚠️ `slug` NÃO EXISTE aqui, e a ausência é a regra: ele nunca é aceito do
 * cliente. `slug` é IDENTIDADE semeada pela migration (`das`, `contador`,
 * `inss`, `pro-labore`, `quitacao-divida`) pra medir o gap da PJ e pra
 * `payDebt()` achar a categoria de quitação sem depender do texto digitado
 * (`0001:92-94`). Categoria criada pelo dono nasce com `slug NULL` — e é isso
 * que torna `uq_categories_slug` (índice parcial, `WHERE slug IS NOT NULL`)
 * impossível de violar por esta porta: NULL não entra num índice parcial que
 * exige NOT NULL, então nem dois nem duzentos cadastros novos colidem.
 * Aceitar slug do cliente permitiria sobrescrever a identidade de uma
 * categoria que o CÓDIGO procura por slug.
 */
export type NewCategory = {
  name: string
  kind: CategoryKind
  parent_id?: string | null
  default_scope?: Scope | null
}

/**
 * ⚠️ `kind` NÃO É PATCHÁVEL, e isso é decisão, não esquecimento. Trocar o
 * `kind` de uma categoria que já tem lançamentos reclassificaria o histórico
 * em SILÊNCIO — a mesma linha de despesa passaria a contar como receita
 * (ou como transferência, que todo relatório de resultado exclui) sem que
 * nada no livro-caixa tivesse mudado. A rota recusa explicitamente com
 * `protected_field` em vez de ignorar (ver `routes/categories.ts`).
 */
export type CategoryPatch = Partial<{
  name: string
  default_scope: Scope | null
  parent_id: string | null
}>

const COLUMNS = `id, parent_id, name, kind, slug, default_scope, archived_at, created_at`

const PATCHABLE_FIELDS = [
  'name',
  'default_scope',
  'parent_id',
] as const satisfies readonly (keyof CategoryPatch)[]

// Mesmo raciocínio de RECURRING_LIST_LIMIT/BY_CATEGORY_LIMIT: no D1 "rows
// read" cobra por linha ESCANEADA, então nenhuma query fica sem teto. Até
// esta fatia a lista era um punhado curado à mão pela migration e o teto
// seria decorativo — a partir de `createCategory` ela cresce pela mão do
// dono, que é exatamente quando um teto deixa de ser decorativo.
const CATEGORY_LIST_LIMIT = 500

function validateName(name: string): string {
  const limpo = name.trim()
  if (limpo === '') throw new RangeError('name é obrigatório')
  return limpo
}

function validateKind(kind: CategoryKind): void {
  if (!CATEGORY_KINDS.includes(kind)) {
    throw new RangeError(
      `kind inválido: ${String(kind)} (esperado income, expense, transfer ou debt_settlement)`,
    )
  }
}

function validateScope(scope: Scope | null): void {
  if (scope !== null && scope !== 'PJ' && scope !== 'PF') {
    throw new RangeError(
      `default_scope inválido: ${String(scope)} (esperado 'PJ', 'PF' ou nulo)`,
    )
  }
}

/**
 * ⚠️ A HIERARQUIA É VALIDADA EM TS PORQUE O `CHECK` DO SCHEMA NÃO BASTA.
 * `0001:100` é só `CHECK (parent_id IS NULL OR parent_id <> id)` — ele barra
 * exatamente UM caso (a categoria ser mãe de si mesma) e NADA além disso:
 * profundidade 3 (neta) passa, e o ciclo A→B→A passa (nenhuma das duas linhas
 * aponta pra si mesma). São dois estados que nenhuma tela consegue renderizar
 * e nenhuma query deste módulo espera.
 *
 * A regra, então: o pai precisa EXISTIR e ser RAIZ (`parent_id IS NULL`).
 * Isso trava a árvore em 2 níveis e mata o ciclo de brinde — num ciclo
 * A→B→A, B teria que ser pai de A, mas B já é filha, logo não é raiz.
 * Zero migration: é validação de aplicação sobre o schema que já existe.
 */
async function assertParentUsable(
  db: D1Database,
  parentId: string,
  selfId: string | null,
): Promise<void> {
  if (selfId !== null && parentId === selfId) {
    throw new RangeError('uma categoria não pode ser mãe de si mesma')
  }

  const pai = await db
    .prepare('SELECT id, parent_id, archived_at FROM categories WHERE id = ?')
    .bind(parentId)
    .first<{
      id: string
      parent_id: string | null
      archived_at: string | null
    }>()

  if (!pai) throw new RangeError(`categoria mãe ${parentId} não existe`)

  if (pai.parent_id !== null) {
    throw new RangeError(
      'a hierarquia tem 2 níveis: a categoria escolhida como mãe já é filha de outra',
    )
  }

  // Pendurar uma filha ATIVA num pai arquivado produz na hora o mesmo estado
  // que `archiveCategory` recusa criar por cima (filha visível, mãe
  // invisível) — só que pela porta de trás.
  if (pai.archived_at !== null) {
    throw new RangeError(
      'a categoria escolhida como mãe está arquivada — desarquive-a antes, ou escolha outra',
    )
  }
}

async function contarFilhas(
  db: D1Database,
  id: string,
  opts: { somenteAtivas: boolean },
): Promise<number> {
  const sql = opts.somenteAtivas
    ? 'SELECT COUNT(*) AS n FROM categories WHERE parent_id = ? AND archived_at IS NULL'
    : 'SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?'
  const row = await db.prepare(sql).bind(id).first<{ n: number }>()
  return row?.n ?? 0
}

async function getCategory(
  db: D1Database,
  id: string,
): Promise<Category | null> {
  return db
    .prepare(`SELECT ${COLUMNS} FROM categories WHERE id = ?`)
    .bind(id)
    .first<Category>()
}

export async function createCategory(
  db: D1Database,
  input: NewCategory,
): Promise<Category> {
  // TS valida ANTES do banco (mesmo padrão de createAccount/createRecurring):
  // o CHECK do schema pegaria `kind` fora do enum, mas com "CHECK constraint
  // failed" cru, que não diz ao dono o que corrigir.
  const name = validateName(input.name)
  validateKind(input.kind)
  const default_scope = input.default_scope ?? null
  validateScope(default_scope)

  const parent_id = input.parent_id ?? null
  if (parent_id !== null) await assertParentUsable(db, parent_id, null)

  const row: Category = {
    id: newId(),
    parent_id,
    name,
    kind: input.kind,
    slug: null, // ver o ⚠️ de NewCategory — nunca vem do cliente.
    default_scope,
    archived_at: null,
    created_at: nowIsoUtc(),
  }

  await db
    .prepare(
      `INSERT INTO categories (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.parent_id,
      row.name,
      row.kind,
      row.slug,
      row.default_scope,
      row.archived_at,
      row.created_at,
    )
    .run()

  return row
}

export async function listCategories(
  db: D1Database,
  opts: { kind?: CategoryKind; includeArchived?: boolean } = {},
): Promise<Category[]> {
  const where: string[] = []
  const binds: unknown[] = []
  if (!opts.includeArchived) where.push('archived_at IS NULL')
  if (opts.kind) {
    where.push('kind = ?')
    binds.push(opts.kind)
  }
  binds.push(CATEGORY_LIST_LIMIT)

  const sql = `SELECT ${COLUMNS} FROM categories
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY name
    LIMIT ?`
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<Category>()
  return res.results
}

/**
 * Update parcial por whitelist (mesma forma de `updateRecurring`): só os
 * campos PRESENTES em `patch` entram no SET. Devolve `null` pra id
 * inexistente — convenção do módulo (archiveAccount/deleteDebt/
 * updateRecurring): id-não-encontrado numa transição de estado é resultado
 * ESPERADO da chamada, não erro de programação; a rota traduz em 404.
 * Exceção (`RangeError`) fica reservada pra entrada inválida.
 *
 * `categories` não tem `updated_at` (conferido no schema, `0001:81-106`) —
 * ao contrário de `accounts`/`recurring_expenses`, não há coluna de carimbo
 * a tocar aqui.
 */
export async function updateCategory(
  db: D1Database,
  id: string,
  patch: CategoryPatch,
): Promise<Category | null> {
  const fields = PATCHABLE_FIELDS.filter((f) => f in patch)
  if (fields.length === 0) return getCategory(db, id)

  const values: unknown[] = []
  for (const field of fields) {
    if (field === 'name') values.push(validateName(patch.name as string))
    else if (field === 'default_scope') {
      const scope = patch.default_scope ?? null
      validateScope(scope)
      values.push(scope)
    } else {
      const novoPai = patch.parent_id ?? null
      if (novoPai !== null) {
        // Virar filha só é possível pra quem não é mãe de ninguém — senão a
        // neta nasceria no mesmo instante, com a árvore em 3 níveis. Conta
        // TODAS as filhas (não só as ativas): a profundidade é invariante de
        // estrutura, e uma filha arquivada continua ocupando o 3º nível na
        // tabela mesmo sem aparecer em tela.
        if ((await contarFilhas(db, id, { somenteAtivas: false })) > 0) {
          throw new RangeError(
            'esta categoria já é mãe de outras — mover ela pra baixo de uma terceira criaria um 3º nível',
          )
        }
        await assertParentUsable(db, novoPai, id)
      }
      values.push(novoPai)
    }
  }

  const set = fields.map((f) => `${f} = ?`).join(', ')
  const res = await db
    .prepare(`UPDATE categories SET ${set} WHERE id = ?`)
    .bind(...values, id)
    .run()
  if (res.meta.changes === 0) return null

  return getCategory(db, id)
}

/**
 * ⚠️ ARQUIVAR, NUNCA `DELETE`. `transactions.category_id` é
 * `ON DELETE SET NULL` (`0001:170`): um `DELETE FROM categories` teria
 * SUCESSO e descategorizaria todo o histórico daquela categoria — sem erro,
 * sem aviso, sem rastro. Os lançamentos continuariam lá, valendo o mesmo
 * dinheiro, só que agrupados em "Sem categoria" pra sempre. É a mesma classe
 * de perda silenciosa que `deleteDebt` já teve que barrar (ver
 * `domain/debts.ts`).
 *
 * `UPDATE ... WHERE id = ? AND archived_at IS NULL` + `boolean` de
 * `meta.changes` — mesma convenção de `archiveAccount`: id inexistente e
 * categoria já arquivada casam zero vezes, e sem checar `meta.changes` os
 * dois ficariam indistinguíveis de um arquivamento novo e bem-sucedido.
 */
export async function archiveCategory(
  db: D1Database,
  id: string,
): Promise<boolean> {
  // ⚠️ Mãe com filhas ATIVAS é RECUSA, não arquivamento. `listCategories`
  // esconde arquivada, então arquivar só a mãe deixaria a filha visível e
  // pendurada num pai que sumiu da tela — um item de menu órfão, sem como o
  // dono entender o que aconteceu nem como desfazer. Aqui só as ATIVAS
  // contam (ao contrário do guard de profundidade em updateCategory): uma
  // filha já arquivada não fica visível, então não há órfã pra criar.
  if ((await contarFilhas(db, id, { somenteAtivas: true })) > 0) {
    throw new RangeError(
      'esta categoria é mãe de categorias ativas — arquive as filhas primeiro, senão elas ficariam visíveis penduradas numa mãe invisível',
    )
  }

  const res = await db
    .prepare(
      'UPDATE categories SET archived_at = ? WHERE id = ? AND archived_at IS NULL',
    )
    .bind(nowIsoUtc(), id)
    .run()
  return res.meta.changes > 0
}
