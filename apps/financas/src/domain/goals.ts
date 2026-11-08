import { isRealCalendarDate, nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { accountBalances } from './accounts'
import { designatedAccountIds } from './reserve'

// Teto de sanidade (R$ 100 milhões): barra erro de digitação de zeros.
export const MAX_GOAL_CENTS = 10_000_000_000
const GOALS_LIMIT = 200
const NAME_MAX = 80
// Cartão tem saldo de dívida e benefício (vale) não se guarda: ficam de fora.
const GOAL_ACCOUNT_KINDS = ['checking', 'savings', 'cash', 'investment']

export type NewGoal = {
  name: string
  target_cents: number
  account_id: string
  target_date?: string | null
}

export type Goal = {
  id: string
  name: string
  target_cents: number
  target_date: string | null
  account_id: string
  created_at: string
  updated_at: string
}

export type GoalStatus = 'concluida' | 'em_andamento' | 'atrasada'

export type GoalProgress = {
  status: GoalStatus
  pct: number
  missing_cents: number
  months_left: number | null
  monthly_needed_cents: number | null
}

export type GoalView = Goal &
  GoalProgress & {
    account_name: string
    balance_cents: number
    /** Conta arquivada: a meta aparece, mas não se edita. */
    editable: boolean
    /** A conta também está na reserva de emergência (o mesmo dinheiro). */
    reserve_overlap: boolean
  }

const ym = (date: string) =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))

/**
 * Os meses contam por mês de calendário, o atual e o do prazo inclusos (de
 * novembro a junho são 8): prazo no mês corrente pede o que falta neste mês. Saldo negativo zera o progresso sem
 * aumentar o que falta.
 */
export function goalProgress(input: {
  balance_cents: number
  target_cents: number
  target_date: string | null
  today: string
}): GoalProgress {
  const { balance_cents, target_cents, target_date, today } = input
  const guardado = Math.max(0, balance_cents)
  // Enquanto falta dinheiro o percentual fica abaixo de 100 (99,6% mostra 99%).
  const pct =
    guardado >= target_cents
      ? Math.round((guardado / target_cents) * 100)
      : Math.floor((guardado * 100) / target_cents)

  if (guardado >= target_cents) {
    return {
      status: 'concluida',
      pct,
      missing_cents: 0,
      months_left: null,
      monthly_needed_cents: null,
    }
  }
  const missing_cents = target_cents - guardado
  if (target_date === null) {
    return {
      status: 'em_andamento',
      pct,
      missing_cents,
      months_left: null,
      monthly_needed_cents: null,
    }
  }
  if (target_date < today) {
    return {
      status: 'atrasada',
      pct,
      missing_cents,
      months_left: null,
      monthly_needed_cents: null,
    }
  }
  const months_left = ym(target_date) - ym(today) + 1
  return {
    status: 'em_andamento',
    pct,
    missing_cents,
    months_left,
    monthly_needed_cents: Math.ceil(missing_cents / months_left),
  }
}

async function validar(
  db: D1Database,
  input: NewGoal,
  selfId: string | null,
): Promise<{
  name: string
  target_cents: number
  target_date: string | null
  account_id: string
}> {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 1 || name.length > NAME_MAX)
    throw new RangeError(`nome precisa ter de 1 a ${NAME_MAX} caracteres`)

  const target = input.target_cents
  if (
    typeof target !== 'number' ||
    !Number.isInteger(target) ||
    target <= 0 ||
    target > MAX_GOAL_CENTS
  )
    throw new RangeError(
      'valor da meta precisa ser um inteiro em centavos, maior que zero',
    )

  const date = input.target_date ?? null
  if (date !== null && (typeof date !== 'string' || !isRealCalendarDate(date)))
    throw new RangeError('prazo precisa ser uma data válida (AAAA-MM-DD)')

  const account_id = input.account_id
  if (typeof account_id !== 'string' || account_id.trim() === '')
    throw new RangeError('escolha a conta onde o dinheiro fica guardado')
  const conta = await db
    .prepare('SELECT kind, archived_at FROM accounts WHERE id = ?')
    .bind(account_id)
    .first<{ kind: string; archived_at: string | null }>()
  if (!conta) throw new RangeError('conta não encontrada')
  if (conta.archived_at !== null)
    throw new RangeError('conta arquivada não aceita meta')
  if (!GOAL_ACCOUNT_KINDS.includes(conta.kind))
    throw new RangeError(
      'meta só em conta corrente, poupança, dinheiro ou investimento',
    )

  const outra = await db
    .prepare(
      'SELECT id FROM savings_goals WHERE account_id = ? AND id IS NOT ?',
    )
    .bind(account_id, selfId)
    .first()
  if (outra) throw new RangeError('essa conta já tem uma meta')

  return { name, target_cents: target, target_date: date, account_id }
}

function contaJaTemMeta(err: unknown): never {
  if (err instanceof Error && /UNIQUE/i.test(err.message))
    throw new RangeError('essa conta já tem uma meta')
  throw err
}

export async function createGoal(
  db: D1Database,
  input: NewGoal,
): Promise<Goal> {
  const v = await validar(db, input, null)
  const now = nowIsoUtc()
  const goal: Goal = { id: newId(), ...v, created_at: now, updated_at: now }
  try {
    await db
      .prepare(
        `INSERT INTO savings_goals
           (id, name, target_cents, target_date, account_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        goal.id,
        goal.name,
        goal.target_cents,
        goal.target_date,
        goal.account_id,
        now,
        now,
      )
      .run()
  } catch (err) {
    contaJaTemMeta(err)
  }
  return goal
}

/** `null` quando a meta não existe (a rota traduz em 404). */
export async function updateGoal(
  db: D1Database,
  id: string,
  input: NewGoal,
): Promise<Goal | null> {
  const atual = await db
    .prepare('SELECT id, created_at FROM savings_goals WHERE id = ?')
    .bind(id)
    .first<{ id: string; created_at: string }>()
  if (!atual) return null
  const v = await validar(db, input, id)
  const now = nowIsoUtc()
  try {
    await db
      .prepare(
        `UPDATE savings_goals
            SET name = ?, target_cents = ?, target_date = ?, account_id = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(v.name, v.target_cents, v.target_date, v.account_id, now, id)
      .run()
  } catch (err) {
    contaJaTemMeta(err)
  }
  return { id, ...v, created_at: atual.created_at, updated_at: now }
}

export async function deleteGoal(db: D1Database, id: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM savings_goals WHERE id = ?')
    .bind(id)
    .run()
  return res.meta.changes > 0
}

export async function listGoals(
  db: D1Database,
  today: string,
): Promise<GoalView[]> {
  const [metas, saldos, reserva] = await Promise.all([
    db
      .prepare(
        `SELECT g.id, g.name, g.target_cents, g.target_date, g.account_id,
                g.created_at, g.updated_at,
                a.name AS account_name, a.archived_at AS account_archived_at
           FROM savings_goals g
           JOIN accounts a ON a.id = g.account_id
          ORDER BY g.created_at, g.id
          LIMIT ?`,
      )
      .bind(GOALS_LIMIT)
      .all<
        Goal & { account_name: string; account_archived_at: string | null }
      >(),
    accountBalances(db),
    designatedAccountIds(db),
  ])
  const saldoDe = new Map(saldos.map((s) => [s.account_id, s.balance_cents]))
  const naReserva = new Set(reserva)

  return metas.results.map(({ account_name, account_archived_at, ...goal }) => {
    const balance_cents = saldoDe.get(goal.account_id) ?? 0
    return {
      ...goal,
      ...goalProgress({
        balance_cents,
        target_cents: goal.target_cents,
        target_date: goal.target_date,
        today,
      }),
      account_name,
      balance_cents,
      editable: account_archived_at === null,
      reserve_overlap: naReserva.has(goal.account_id),
    }
  })
}
