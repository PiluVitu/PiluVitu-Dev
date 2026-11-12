import type { LinhaImportada } from '@piluvitu/tools/import'
import { billCompetence, isRealCalendarDate, nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { occurrenceMatchWindow, type Frequency } from './recurring'
import {
  contraparteEhPropria,
  getNomesProprios,
  parearTransferencias,
} from './transfer-pairing'

/**
 * Fatia ② (docs/superpowers/specs/2026-07-27-financas-import-design.md).
 * `LinhaImportada` (packages/tools) já traz `imported_id` (FITID do OFX, ou
 * hash estável do CSV — `idEstavel`), `purchase_date`, `amount_cents`,
 * `description`. `payee_id`/`category_id`/`is_business` são opcionais e
 * forward-looking: a tela de conferência (tasks 4-6) confirma sugestão de
 * payee/categoria ANTES de mandar a linha — nada aqui infere sozinho (§7 do
 * spec: payee é sugestão confirmável, nunca gravação automática).
 */
export type ImportRow = LinhaImportada & {
  payee_id?: string | null
  category_id?: string | null
  is_business?: 0 | 1
}

export type ImportRequest = {
  account_id: string
  import_source: string
  rows: ImportRow[]
}

/**
 * `imported` conta só as linhas inseridas; `reconciled`, as que atualizaram
 * o pendente gerado por uma recorrente (sem linha nova). `total` é a soma
 * das três.
 */
export type ImportResult = {
  total: number
  imported: number
  skipped: number
  reconciled: number
}

export class ImportError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ImportError'
    this.code = code
  }
}

// Mesmo enum do CHECK da migration 0001 (`import_source IS NULL OR
// import_source IN (...)`) — validado aqui ANTES de tocar o banco porque
// import_source é um único valor pra REQUISIÇÃO inteira (não por linha), e
// falhar cedo evita montar batch pra depois descartar tudo.
export const IMPORT_SOURCES = [
  'manual',
  'ofx',
  'csv',
  'pdf',
  'pluggy',
  'share-target',
] as const

// ORÇAMENTO DE BOUND PARAMS — mesmo teto medido no resto do módulo (ver
// domain/installments.ts): 100 params por statement no D1. 19 colunas bound
// (recurring_expense_id fica de fora — import não vincula a recorrente
// nesta fatia, cai no DEFAULT NULL da coluna) => floor(100/19) = 5 linhas
// por statement. settled_at é derivado do TIPO DA CONTA (ver
// `settledAtValue` abaixo): extrato bancário já aconteceu, fatura de
// cartão não.
const TX_COLUMNS = [
  'id',
  'account_id',
  'amount_cents',
  'currency',
  'amount_original_cents',
  'fx_rate_ppm',
  'purchase_date',
  'bill_competence',
  'settled_at',
  'description',
  'payee_id',
  'category_id',
  'is_business',
  'transfer_id',
  'parent_id',
  'imported_id',
  'import_source',
  'created_at',
  'updated_at',
] as const

const MAX_BOUND_PARAMS = 100
const TX_ROWS_PER_STATEMENT = Math.floor(MAX_BOUND_PARAMS / TX_COLUMNS.length) // 5
const TX_TUPLE = `(${TX_COLUMNS.map(() => '?').join(', ')})`

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

function insertStatements(
  db: D1Database,
  rows: unknown[][],
): D1PreparedStatement[] {
  const head = `INSERT INTO transactions (${TX_COLUMNS.join(', ')}) VALUES `
  return chunk(rows, TX_ROWS_PER_STATEMENT).map((group) =>
    db
      .prepare(head + group.map(() => TX_TUPLE).join(', '))
      .bind(...group.flat()),
  )
}

// Pendente já liquidado (a fatura paga) mantém a liquidação e a fatura.
const UPDATE_GENERATED_PENDING = `UPDATE transactions
   SET amount_cents = ?, purchase_date = ?,
       bill_competence = CASE WHEN settled_at IS NULL THEN ? ELSE bill_competence END,
       settled_at = COALESCE(?, settled_at),
       description = ?, imported_id = ?, import_source = ?,
       payee_id = COALESCE(?, payee_id),
       is_business = COALESCE(?, is_business),
       category_id = COALESCE(category_id, ?),
       updated_at = ?
 WHERE id = ? AND account_id = ? AND imported_id IS NULL`

const INSERT_IF_STILL_MISSING = `INSERT INTO transactions (${TX_COLUMNS.join(', ')})
  SELECT ${TX_TUPLE.slice(1, -1)}
   WHERE NOT EXISTS (
     SELECT 1 FROM transactions WHERE account_id = ? AND imported_id = ?
   )`

const PENDING_CANDIDATES_LIMIT = 500

type PendingCandidate = {
  id: string
  due_date: string
  frequency: Frequency
  amount_min_cents: number
  amount_max_cents: number
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b
}

function minDate(a: string, b: string): string {
  return a < b ? a : b
}

/**
 * imported_id da linha → id do pendente gerado que ela atualiza. Ver
 * "Conciliação recorrente × importação" no CLAUDE.md.
 */
async function reconciliationMatches(
  db: D1Database,
  accountId: string,
  rows: ImportRow[],
): Promise<Map<string, string>> {
  const matches = new Map<string, string>()
  const outgoing = rows.filter((row) => row.amount_cents < 0)
  if (outgoing.length === 0) return matches

  const dates = outgoing.map((row) => row.purchase_date).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  const from = minDate(
    occurrenceMatchWindow('monthly', first).from,
    occurrenceMatchWindow('weekly', first).from,
  )
  const to = maxDate(
    occurrenceMatchWindow('monthly', last).to,
    occurrenceMatchWindow('weekly', last).to,
  )
  const pending = await db
    .prepare(
      `SELECT t.id, o.due_date, r.frequency, r.amount_min_cents, r.amount_max_cents
         FROM recurring_occurrences o
         JOIN transactions t ON t.id = o.transaction_id
         JOIN recurring_expenses r ON r.id = o.recurring_expense_id
        WHERE o.origin = 'gerado'
          AND o.due_date >= ?
          AND o.due_date <= ?
          AND t.account_id = ?
          AND t.imported_id IS NULL
        LIMIT ?`,
    )
    .bind(from, to, accountId, PENDING_CANDIDATES_LIMIT)
    .all<PendingCandidate>()
  if (pending.results.length === 0) return matches

  const ownNames = await getNomesProprios(db)
  const pendingsByRow = new Map<string, string[]>()
  const rowsByPending = new Map<string, number>()
  for (const row of outgoing) {
    if (contraparteEhPropria(row.description, ownNames)) continue
    const magnitude = -row.amount_cents
    const hits = pending.results.filter((p) => {
      const window = occurrenceMatchWindow(p.frequency, p.due_date)
      return (
        magnitude >= p.amount_min_cents &&
        magnitude <= p.amount_max_cents &&
        row.purchase_date >= window.from &&
        row.purchase_date <= window.to
      )
    })
    pendingsByRow.set(
      row.imported_id,
      hits.map((p) => p.id),
    )
    for (const p of hits) {
      rowsByPending.set(p.id, (rowsByPending.get(p.id) ?? 0) + 1)
    }
  }

  for (const [importedId, ids] of pendingsByRow) {
    if (ids.length === 1 && rowsByPending.get(ids[0]) === 1) {
      matches.set(importedId, ids[0])
    }
  }
  return matches
}

/**
 * Grava linhas já estruturadas (o Worker nunca vê o arquivo — §3 do spec).
 * Revalida tudo (§ trust boundary): import_source contra o enum, conta
 * existente, e cada linha (imported_id, data calendarialmente real,
 * amount_cents inteiro, description não-vazia). Deliberadamente NÃO checa
 * amount_cents <> 0 aqui: esse é o CHECK do próprio schema, e deixar ele
 * disparar (traduzido pela rota via friendlyConstraintMessage) evita
 * duplicar a regra em dois lugares.
 *
 * Idempotência: linhas cujo `imported_id` já existe NAQUELA conta (ou que
 * se repetem dentro da MESMA requisição) são puladas ANTES de montar o
 * batch — nunca dependendo do `uq_tx_imported` pra barrar, porque um
 * INSERT multi-row que viola UNIQUE falha o statement inteiro, e
 * `db.batch()` reverte a sequência inteira num erro (rollback real): uma
 * única duplicata no meio de 5 linhas novas apagaria as outras 4.
 *
 * `bill_competence` é DERIVADO por linha quando a conta é `credit_card`
 * (`billCompetence(purchase_date, account.closing_day)`, a MESMA função de
 * `createTransaction` — nunca uma segunda regra) — sem isto, um extrato de
 * fatura importado ficaria fora de `commitments()` (que só soma parcela
 * prevista com `bill_competence IS NOT NULL`), o compromisso mais valioso
 * que esta fatia existe pra capturar. Conta que não é cartão grava NULL —
 * só cartão tem fatura.
 */
// `to` da janela de pareamento e EXCLUSIVO; sem somar um dia, a remessa de
// um unico dia consultaria um intervalo vazio.
function diaSeguinte(dia: string): string {
  const d = new Date(`${dia}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function importTransactions(
  db: D1Database,
  input: ImportRequest,
): Promise<ImportResult> {
  if (
    !IMPORT_SOURCES.includes(
      input.import_source as (typeof IMPORT_SOURCES)[number],
    )
  ) {
    throw new ImportError(
      'invalid_import_source',
      `import_source deve ser um de: ${IMPORT_SOURCES.join(', ')}`,
    )
  }

  // kind/closing_day (não só id): commitments() só soma parcela prevista com
  // bill_competence IS NOT NULL — sem derivar aqui, um extrato de cartão
  // importado hoje entraria no livro-caixa mas NUNCA apareceria no
  // Comprometido, a tela que este módulo existe pra alimentar.
  const account = await db
    .prepare('SELECT id, kind, closing_day, scope FROM accounts WHERE id = ?')
    .bind(input.account_id)
    .first<{
      id: string
      kind: string
      closing_day: number | null
      scope: string
    }>()
  if (!account) {
    throw new ImportError('invalid_account', 'conta não encontrada')
  }

  const rows = input.rows
  const total = rows.length

  rows.forEach((row, index) => {
    if (typeof row.imported_id !== 'string' || row.imported_id.trim() === '') {
      throw new ImportError(
        'invalid_row',
        `linha ${index}: imported_id é obrigatório`,
      )
    }
    if (
      typeof row.purchase_date !== 'string' ||
      !isRealCalendarDate(row.purchase_date)
    ) {
      throw new ImportError(
        'invalid_row',
        `linha ${index}: purchase_date inválida (esperado YYYY-MM-DD real)`,
      )
    }
    if (
      typeof row.amount_cents !== 'number' ||
      !Number.isInteger(row.amount_cents)
    ) {
      throw new ImportError(
        'invalid_row',
        `linha ${index}: amount_cents deve ser inteiro em centavos`,
      )
    }
    if (typeof row.description !== 'string' || row.description.trim() === '') {
      throw new ImportError(
        'invalid_row',
        `linha ${index}: description é obrigatória`,
      )
    }
  })

  if (total === 0) return { total: 0, imported: 0, skipped: 0, reconciled: 0 }

  // Sem IN (...) por linha: um extrato de 200 linhas estouraria os 100 params
  // por statement só nesta checagem. account_id sozinho usa o índice parcial
  // `uq_tx_imported` (account_id, imported_id) WHERE imported_id IS NOT NULL.
  const existing = await db
    .prepare(
      'SELECT imported_id FROM transactions WHERE account_id = ? AND imported_id IS NOT NULL',
    )
    .bind(input.account_id)
    .all<{ imported_id: string }>()
  const existingIds = new Set(existing.results.map((r) => r.imported_id))

  const now = nowIsoUtc()
  const seenInThisRequest = new Set<string>()
  const fresh: { row: ImportRow; values: unknown[] }[] = []
  let skipped = 0

  for (const row of rows) {
    if (
      existingIds.has(row.imported_id) ||
      seenInThisRequest.has(row.imported_id)
    ) {
      skipped++
      continue
    }
    seenInThisRequest.add(row.imported_id)
    // Mesma derivação de createTransaction (domain/transactions.ts): só
    // cartão tem fatura, e só quando a conta tem closing_day configurado.
    // Reusa billCompetence(purchase_date, closing_day) em vez de uma
    // segunda regra que pudesse divergir da já testada.
    const billCompetenceValue =
      account.kind === 'credit_card' && account.closing_day !== null
        ? billCompetence(row.purchase_date, account.closing_day)
        : null
    // Só cartão nasce previsto. Em conta corrente/poupança/dinheiro o
    // extrato É o registro de que o dinheiro já se moveu — e o Pluggy só
    // importa `POSTED` (pluggy-map.ts#STATUS_IMPORTAVEL), nunca `PENDING`.
    // Data pura 'YYYY-MM-DD', mesma convenção de createTransfer()/payDebt()
    // (ver o ⚠️ de localCompetence em domain/cashflow.ts).
    const settledAtValue =
      account.kind === 'credit_card' ? null : row.purchase_date
    fresh.push({
      row,
      values: [
        newId(),
        input.account_id,
        row.amount_cents,
        'BRL',
        null, // amount_original_cents
        null, // fx_rate_ppm
        row.purchase_date,
        billCompetenceValue,
        settledAtValue,
        row.description,
        row.payee_id ?? null,
        row.category_id ?? null,
        row.is_business ?? (account.scope === 'PJ' ? 1 : 0),
        null, // transfer_id
        null, // parent_id
        row.imported_id,
        input.import_source,
        now,
        now,
      ],
    })
  }

  if (fresh.length === 0) return { total, imported: 0, skipped, reconciled: 0 }

  const matches = await reconciliationMatches(
    db,
    input.account_id,
    fresh.map((f) => f.row),
  )
  const plainRows: unknown[][] = []
  const reconcileStatements: D1PreparedStatement[] = []
  for (const { row, values } of fresh) {
    const pendingId = matches.get(row.imported_id)
    if (pendingId === undefined) {
      plainRows.push(values)
      continue
    }
    reconcileStatements.push(
      db
        .prepare(UPDATE_GENERATED_PENDING)
        .bind(
          row.amount_cents,
          row.purchase_date,
          values[7],
          values[8],
          row.description,
          row.imported_id,
          input.import_source,
          row.payee_id ?? null,
          row.is_business ?? null,
          row.category_id ?? null,
          now,
          pendingId,
          input.account_id,
        ),
      db
        .prepare(INSERT_IF_STILL_MISSING)
        .bind(...values, input.account_id, row.imported_id),
    )
  }

  const results = await db.batch([
    ...reconcileStatements,
    ...insertStatements(db, plainRows),
  ])
  let imported = plainRows.length
  let reconciled = 0
  for (let i = 0; i < reconcileStatements.length; i += 2) {
    if (results[i].meta.changes > 0) reconciled++
    else if (results[i + 1].meta.changes > 0) imported++
    else skipped++
  }

  // A perna que fecha a transferencia chega em OUTRA chamada (uma
  // account_id por requisicao), entao quem pareia e sempre a segunda a
  // ser importada. Janela restrita as datas desta remessa: no D1 "rows
  // read" cobra linha ESCANEADA, e uma varredura do ledger inteiro a
  // cada import sairia da cota. Ver domain/transfer-pairing.ts.
  const datas = fresh.map((f) => f.row.purchase_date).sort()
  await parearTransferencias(db, {
    from: datas[0],
    to: diaSeguinte(datas[datas.length - 1]),
  })

  return { total, imported, skipped, reconciled }
}
