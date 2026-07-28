import { newId } from '../lib/ids'
import { nowIsoUtc } from '../lib/dates'

export type PayeeKind = 'person' | 'merchant' | 'government' | 'self_entity'

export type Payee = {
  id: string
  name: string
  norm_name: string
  kind: PayeeKind
  document: string | null
  default_category_id: string | null
  created_at: string
}

const UF = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
])

const MAQUININHAS = new Set([
  'PAGSEGURO',
  'PAGBANK',
  'MERCADOPAGO',
  'CIELO',
  'REDE',
  'STONE',
  'GETNET',
  'SUMUP',
  'PAGARME',
  'PICPAY',
  'INFINITEPAY',
])

/**
 * Chave de matching de estabelecimento (fatia ②). Criada já na ① porque
 * o índice idx_payees_norm do D1 não é alterável depois.
 * Limitação conhecida: cidade de nome composto deixa resíduo ('SAO' em
 * 'MERCADO X SAO LUIS MA'), porque só o último token de cidade é cortado.
 */
export function normalizeName(name: string): string {
  const tokens = name
    .normalize('NFD')
    // \p{M} (categoria Unicode "Mark") cobre os diacríticos combinantes que
    // normalize('NFD') separa da letra-base — mais amplo que o range fixo
    // U+0300..U+036F, e sem caractere combinante literal na fonte (frágil:
    // editor/formatter pode normalizar e quebrar o regex em silêncio).
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  while (tokens.length > 1 && MAQUININHAS.has(tokens[tokens.length - 1]))
    tokens.pop()

  if (tokens.length > 1 && UF.has(tokens[tokens.length - 1])) {
    tokens.pop()
    if (tokens.length > 1) tokens.pop()
  }

  return tokens.join(' ')
}

export type NewPayee = {
  name: string
  kind: PayeeKind
  document?: string | null
  default_category_id?: string | null
}

export async function createPayee(
  db: D1Database,
  input: NewPayee,
): Promise<Payee> {
  const row: Payee = {
    id: newId(),
    name: input.name,
    norm_name: normalizeName(input.name),
    kind: input.kind,
    document: input.document ?? null,
    default_category_id: input.default_category_id ?? null,
    created_at: nowIsoUtc(),
  }

  await db
    .prepare(
      'INSERT INTO payees (id, name, norm_name, kind, document, default_category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      row.id,
      row.name,
      row.norm_name,
      row.kind,
      row.document,
      row.default_category_id,
      row.created_at,
    )
    .run()

  return row
}

export async function listPayees(
  db: D1Database,
  opts: { kind?: PayeeKind } = {},
): Promise<Payee[]> {
  const stmt = opts.kind
    ? db
        .prepare('SELECT * FROM payees WHERE kind = ? ORDER BY norm_name')
        .bind(opts.kind)
    : db.prepare('SELECT * FROM payees ORDER BY norm_name')

  const { results } = await stmt.all<Payee>()
  return results
}
