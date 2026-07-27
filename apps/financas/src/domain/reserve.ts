import { todayInTeresina } from '../lib/dates'
import { getSetting } from './settings'

/**
 * Fatia ⑦ (docs/superpowers/specs/2026-07-27-financas-reserva-design.md):
 * fundo de emergência. `meses de sobrevivência = saldo ÷ custo fixo mensal`
 * — e como o custo fixo é FAIXA (o DAS varia R$ 12–600, mesma faixa da
 * fatia ⑥), a sobrevivência também é.
 *
 * ⚠️ A faixa INVERTE em relação ao custo: dividir pelo custo MÁXIMO dá a
 * sobrevivência MÍNIMA (pior cenário), e dividir pelo custo MÍNIMO dá a
 * sobrevivência MÁXIMA. É o oposto do Comprometido, onde o TETO é o perigo
 * (gasto máximo) — aqui o PISO é o perigo (sobrevivência mínima).
 */

export type FixedCostRange = { min: number; max: number }

// Mesmo raciocínio de RECURRING_LIST_LIMIT em domain/recurring.ts: a
// tabela tem no máximo uma dezena de linhas em regime normal — teto de
// defesa, não regra de negócio (D1 cobra por linha ESCANEADA).
const RECURRING_LIMIT = 500

/**
 * Soma `amount_min_cents`/`amount_max_cents` de toda recorrente ATIVA e EM
 * VIGOR hoje — "inativa ou encerrada não entra" (brief, teste 2).
 *
 * Não usa `projectRecurring`/competência de propósito: a pergunta aqui é
 * "quanto custa por mês para sobreviver" (uma base estável pra dividir a
 * reserva), não "o que ainda falta pagar nesta competência". Se
 * reusássemos a supressão de `projectRecurring` (que apaga a projeção
 * quando já existe lançamento vinculado NAQUELE mês), o custo fixo — e
 * portanto os meses de sobrevivência — oscilaria dependendo do dia em que
 * o dono abrisse a tela, mesmo sem nada mudar na vida financeira dele.
 */
export async function monthlyFixedCost(
  db: D1Database,
): Promise<FixedCostRange> {
  const today = todayInTeresina()
  const res = await db
    .prepare(
      `SELECT amount_min_cents, amount_max_cents
         FROM recurring_expenses
        WHERE active = 1
          AND starts_on <= ?
          AND (ends_on IS NULL OR ends_on >= ?)
        LIMIT ?`,
    )
    .bind(today, today, RECURRING_LIMIT)
    .all<{ amount_min_cents: number; amount_max_cents: number }>()

  return res.results.reduce<FixedCostRange>(
    (acc, r) => ({
      min: acc.min + r.amount_min_cents,
      max: acc.max + r.amount_max_cents,
    }),
    { min: 0, max: 0 },
  )
}

// Designação vive em `settings` (chave-valor genérica desde a 0005) sob
// esta chave — preferência, não fato estrutural, então nenhuma migration
// nova (spec §4). Exportada (Task 2, fatia ⑦): `routes/reserve.ts` precisa
// dela para gravar a designação via `setSetting` genérico — a escrita em si
// mora na ROTA (não um novo escritor aqui em domain/reserve.ts), então só a
// CHAVE precisa ser compartilhada, evitando um literal duplicado nos dois
// arquivos.
export const EMERGENCY_ACCOUNTS_KEY = 'emergency_accounts'

// Defesa contra um valor corrompido/gigante em `settings.value` (ex.:
// escrito à mão via `wrangler d1 execute`): limita quantos ids entram no
// `IN (...)` da query de saldo — o teto de 100 bound params por statement
// (mesmo já documentado em domain/import.ts) é por isso que o corte fica
// bem abaixo disso.
const MAX_DESIGNATED_ACCOUNTS = 100

/**
 * Lê `settings.emergency_accounts` (JSON de `account_id[]`). Degrada pra
 * `[]` — nunca lança — quando a chave não existe ou o valor salvo não é o
 * JSON esperado (mesma filosofia defensiva de `getFixedNetCents`: uma
 * linha corrompida não pode derrubar a tela, só faz a reserva parecer
 * "sem conta designada").
 */
async function designatedAccountIds(db: D1Database): Promise<string[]> {
  const raw = await getSetting(db, EMERGENCY_ACCOUNTS_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is string => typeof v === 'string')
      .slice(0, MAX_DESIGNATED_ACCOUNTS)
  } catch {
    return []
  }
}

export type EmergencyStatus = {
  saldo_cents: number
  meta_cents: FixedCostRange
  meses: FixedCostRange | null
  contas: string[]
}

/**
 * `saldo_cents` é a soma dos saldos das contas designadas — nunca um
 * número auto-declarado (spec §4: "saldo de conta é o que existe"). Uma
 * conta arquivada que ainda esteja designada NÃO conta (brief, teste 7):
 * filtrada na própria query, não escondida da lista `contas` devolvida —
 * `contas` reflete o que foi DESIGNADO (útil pra tela de preferências
 * mostrar e permitir remover), `saldo_cents` reflete o que de fato soma.
 *
 * `meses` é `null` sem nenhum custo fixo cadastrado — NUNCA `Infinity`
 * ("imortal") nem `0` ("falido"): as duas seriam mentiras quando a
 * verdade é "nada foi registrado ainda" (brief). `amount_min_cents > 0`
 * é `CHECK` do schema (migration 0006), então `custo.max === 0` só
 * acontece quando não há nenhuma recorrente em vigor — não há caso em que
 * `max` seja 0 com `min` positivo.
 */
export async function emergencyStatus(
  db: D1Database,
  opts: { goal_months: number },
): Promise<EmergencyStatus> {
  const contas = await designatedAccountIds(db)

  let saldo_cents = 0
  if (contas.length > 0) {
    const placeholders = contas.map(() => '?').join(',')
    const res = await db
      .prepare(
        `SELECT a.opening_balance_cents + COALESCE(SUM(t.amount_cents), 0) AS balance_cents
           FROM accounts a
           LEFT JOIN transactions t
                  ON t.account_id = a.id AND t.parent_id IS NULL
          WHERE a.id IN (${placeholders})
            AND a.archived_at IS NULL
          GROUP BY a.id`,
      )
      .bind(...contas)
      .all<{ balance_cents: number }>()
    saldo_cents = res.results.reduce((sum, r) => sum + r.balance_cents, 0)
  }

  const custo = await monthlyFixedCost(db)
  const meta_cents: FixedCostRange = {
    min: custo.min * opts.goal_months,
    max: custo.max * opts.goal_months,
  }

  // Divisão nunca arredondada aqui — fração fica fração; arredondar é
  // responsabilidade de quem EXIBE (ver CLAUDE.md do módulo).
  const meses: FixedCostRange | null =
    custo.max === 0
      ? null
      : {
          min: saldo_cents / custo.max, // custo MÁXIMO ⇒ sobrevivência MÍNIMA
          max: saldo_cents / custo.min, // custo MÍNIMO ⇒ sobrevivência MÁXIMA
        }

  return { saldo_cents, meta_cents, meses, contas }
}
