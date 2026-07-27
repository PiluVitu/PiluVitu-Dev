import { nowIsoUtc } from '../lib/dates'
import { DEFAULT_FIXED_NET_CENTS } from './reports'

/**
 * Tabela `settings` (migration 0005) é chave-valor genérica — este arquivo
 * só conhece a chave `fixed_net_cents` (Task 10), o denominador editável do
 * "% do líquido fixo" em `commitments()`. Uma configuração futura reusa a
 * MESMA tabela com uma chave nova, sem migration.
 */
const FIXED_NET_CENTS_KEY = 'fixed_net_cents'

// Teto de SANIDADE, não regra de negócio: acima disto é claramente erro de
// digitação (ex.: um zero a mais), não renda real de uma pessoa física/PJ
// solo. R$ 1.000.000,00.
export const MAX_FIXED_NET_CENTS = 100_000_000

/**
 * `DEFAULT_FIXED_NET_CENTS` quando: (a) nenhuma linha foi salva ainda, ou
 * (b) a linha salva não passa mais na validação (defesa — hoje inalcançável
 * na prática, já que `setFixedNetCents` valida ANTES de gravar; existe pro
 * dia em que a chave for escrita por outro caminho, ex. `wrangler d1
 * execute` manual).
 */
export async function getFixedNetCents(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(FIXED_NET_CENTS_KEY)
    .first<{ value: string }>()
  if (!row) return DEFAULT_FIXED_NET_CENTS

  const n = Number(row.value)
  return Number.isInteger(n) && n > 0 && n <= MAX_FIXED_NET_CENTS
    ? n
    : DEFAULT_FIXED_NET_CENTS
}

/**
 * Upsert por `key` — `ON CONFLICT` em vez de DELETE+INSERT: mantém a PK
 * estável e é uma única roundtrip. Valida ANTES de tocar o banco: um valor
 * inválido não deixa rastro (nem grava, nem sobrescreve o valor bom
 * anterior) — mesmo princípio de `createAccount` (TS valida, D1 é defesa,
 * não a única linha de validação).
 */
export async function setFixedNetCents(
  db: D1Database,
  value: number,
): Promise<number> {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_FIXED_NET_CENTS) {
    throw new RangeError(
      `fixed_net_cents inválido: ${value} (esperado inteiro entre 1 e ${MAX_FIXED_NET_CENTS})`,
    )
  }

  // `value` sempre BINDADO COMO STRING (String(value), nunca o number cru):
  // a coluna é TEXT numa tabela STRICT, e um INTEGER bindado ali É aceito —
  // só que CONVERTIDO (MEDIDO, ver CLAUDE.md/"Migrations": 12345 vira
  // '12345.0'), não gravado como '360000' exato. Bindar string evita
  // depender dessa conversão silenciosa por baixo.
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(FIXED_NET_CENTS_KEY, String(value), nowIsoUtc())
    .run()

  return value
}
