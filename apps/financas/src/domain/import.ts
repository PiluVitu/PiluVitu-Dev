import type { LinhaImportada } from '@piluvitu/tools/import'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'

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

export type ImportResult = {
  total: number
  imported: number
  skipped: number
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

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// Mesma técnica de lib/dates.ts#daysInMonth: Date.UTC com y/m/d EXPLÍCITOS
// não tem fuso a resolver (ao contrário de parsear uma string ISO completa),
// então o round-trip é um jeito seguro de rejeitar data que passa no FORMATO
// mas não existe no calendário (ex.: 2026-02-30).
function isRealCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (match === null) return false
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const dt = new Date(Date.UTC(year, month - 1, day))
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  )
}

// ORÇAMENTO DE BOUND PARAMS — mesmo teto medido no resto do módulo (ver
// domain/installments.ts): 100 params por statement no D1. 19 colunas bound
// (recurring_expense_id fica de fora — import não vincula a recorrente
// nesta fatia, cai no DEFAULT NULL da coluna) => floor(100/19) = 5 linhas
// por statement. bill_competence sai sempre NULL: a fatia ② não deriva
// fatura na importação (fica pra uma iteração futura, sem teste que cubra
// hoje); settled_at também NULL, mesmo default de um lançamento manual sem
// o campo informado.
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
 */
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

  const account = await db
    .prepare('SELECT id FROM accounts WHERE id = ?')
    .bind(input.account_id)
    .first<{ id: string }>()
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

  if (total === 0) return { total: 0, imported: 0, skipped: 0 }

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
  const txRows: unknown[][] = []
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
    txRows.push([
      newId(),
      input.account_id,
      row.amount_cents,
      'BRL',
      null, // amount_original_cents
      null, // fx_rate_ppm
      row.purchase_date,
      null, // bill_competence
      null, // settled_at
      row.description,
      row.payee_id ?? null,
      row.category_id ?? null,
      row.is_business ?? 0,
      null, // transfer_id
      null, // parent_id
      row.imported_id,
      input.import_source,
      now,
      now,
    ])
  }

  if (txRows.length > 0) {
    await db.batch(insertStatements(db, txRows))
  }

  return { total, imported: txRows.length, skipped }
}
