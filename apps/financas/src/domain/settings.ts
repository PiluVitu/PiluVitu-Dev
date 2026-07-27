import { nowIsoUtc } from '../lib/dates'
import { logConstraintError } from '../lib/errors'
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
  let row: { value: string } | null
  try {
    row = await db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(FIXED_NET_CENTS_KEY)
      .first<{ value: string }>()
  } catch (err) {
    // CRITICAL C2 (fix final): a tabela `settings` só existe a partir da
    // migration 0005 — se `wrangler deploy` rodar ANTES de
    // `wrangler d1 migrations apply --remote` (ordem documentada em
    // CLAUDE.md/"Deploy", mas não garantida por nada além de disciplina),
    // este SELECT falha com `no such table: settings`. Antes deste fix o
    // erro subia cru (sem try/catch aqui, e `routes/reports.ts` chama
    // `resolveFixedNetCents`/`getFixedNetCents` FORA do try/catch da rota)
    // até um `throw` não tratado — `src/index.ts` não registra `onError`,
    // então virava um 500 sem envelope, e a SPA (`api()`) traduzia isso
    // pra `ApiError(code: 'invalid_envelope')`. Três telas dependem deste
    // caminho: o bloco Comprometido da home, `#/comprometido` (mesma
    // chamada) e `#/configuracoes` (`GET /api/settings`, que também chama
    // `getFixedNetCents`) — uma tabela faltando derrubava as três de uma
    // vez. Degrada pro mesmo default de "nada foi salvo" em vez de 500:
    // defesa em profundidade — a ORDEM migration-antes-de-deploy continua
    // sendo a regra (ver CLAUDE.md/"Deploy" § 2), isto só evita que um
    // deploy fora de ordem tire três telas do ar em vez de mostrar o piso
    // R$ 3.600 até a migration rodar. Logado (não silencioso) via o mesmo
    // helper de `lib/errors.ts` usado pelos outros domínios — dá pra ver
    // em `wrangler tail` sem expor detalhe de schema pro cliente.
    logConstraintError('getFixedNetCents', String(err))
    return DEFAULT_FIXED_NET_CENTS
  }
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

/**
 * Chave-valor GENÉRICO de verdade — o comentário do topo deste arquivo já
 * dizia "uma configuração futura reusa esta MESMA tabela sem migration
 * nova"; `getSetting`/`setSetting` são esse consumidor (fatia ②, Tasks 4-5:
 * mapa de colunas de import por conta, chave `import_map:<account_id>`).
 * Ao contrário de `getFixedNetCents`/`setFixedNetCents`, nenhuma validação
 * de FORMATO — `value` é uma string opaca, o chamador decide o que ela
 * significa (aqui, um `JSON.stringify` de `MapaColunas`). A proteção contra
 * a chave `fixed_net_cents` ser escrita por este caminho genérico (e assim
 * escapar da validação numérica de `setFixedNetCents`) mora na ROTA
 * (`routes/settings.ts`), não aqui — mesma separação de responsabilidade
 * de sempre neste módulo: domínio faz a operação, rota decide QUAL chave
 * pode passar por QUAL caminho.
 */
export async function getSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  try {
    const row = await db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(key)
      .first<{ value: string }>()
    return row?.value ?? null
  } catch (err) {
    // Mesma defesa de `getFixedNetCents` (fix final, achado C2): tabela
    // ausente (deploy fora de ordem) degrada pra "nada salvo" em vez de
    // propagar um 500 sem envelope.
    logConstraintError('getSetting', String(err))
    return null
  }
}

export async function setSetting(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, nowIsoUtc())
    .run()
}
