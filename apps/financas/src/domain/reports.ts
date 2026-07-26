import { addMonthsToCompetence } from '../lib/dates'

export type CommitmentCell = {
  competence: string
  account_id: string
  account_name: string
  committed_cents: number
}

export type CommitmentReport = {
  competences: string[]
  rows: Array<{ account_id: string; account_name: string; cells: number[] }>
  totals: number[]
  fixed_net_cents: number
  pct_of_fixed_net: number[]
}

/**
 * Liquido em mes SEM freela: R$ 4.300 bruto − R$ 700 de camada PJ = R$ 3.600.
 * Este e o denominador correto do "% do liquido fixo". O liquido COM freela
 * (R$ 5.480) esconderia o risco que esta tela existe pra mostrar.
 */
export const DEFAULT_FIXED_NET_CENTS = 360000

const COMPETENCE_RE = /^\d{4}-(0[1-9]|1[0-2])$/

type DebtRow = { debt_id: string; title: string; remaining_cents: number }

export async function commitments(
  db: D1Database,
  opts: { from: string; months: number; fixed_net_cents: number },
): Promise<CommitmentReport> {
  const { from, months, fixed_net_cents } = opts

  if (!COMPETENCE_RE.test(from)) {
    throw new RangeError(`competencia invalida: ${from} (esperado 'YYYY-MM')`)
  }
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new RangeError(
      `months invalido: ${months} (esperado inteiro entre 1 e 24)`,
    )
  }

  const competences = Array.from({ length: months }, (_, i) =>
    addMonthsToCompetence(from, i),
  )
  const slot = new Map(competences.map((c, i) => [c, i]))
  const placeholders = competences.map(() => '?').join(',')

  // Parcelas previstas: settled_at NULL. transfer_id/parent_id NULL pelo mesmo
  // motivo da view v_cashflow — perna de transferencia e filha de rateio
  // contariam duas vezes.
  const previstas = await db
    .prepare(
      `SELECT t.bill_competence   AS competence,
              t.account_id        AS account_id,
              a.name              AS account_name,
              -SUM(t.amount_cents) AS committed_cents
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
        WHERE t.settled_at      IS NULL
          AND t.transfer_id     IS NULL
          AND t.parent_id       IS NULL
          AND t.bill_competence IS NOT NULL
          AND t.bill_competence IN (${placeholders})
        GROUP BY t.account_id, t.bill_competence
       HAVING SUM(t.amount_cents) < 0`,
    )
    .bind(...competences)
    .all<CommitmentCell>()

  // Divida aberta que EU devo. Sem cronograma na fatia ①, o saldo inteiro cai
  // na competencia mais proxima da janela (leitura conservadora).
  const dividas = await db
    .prepare(
      `SELECT d.id    AS debt_id,
              d.title AS title,
              SUM(CASE WHEN b.remaining_cents > 0 THEN b.remaining_cents ELSE 0 END)
                      AS remaining_cents
         FROM debts d
         JOIN v_debt_item_balance b ON b.debt_id = d.id
        WHERE d.status    = 'open'
          AND d.direction = 'i_owe'
        GROUP BY d.id
       HAVING remaining_cents > 0`,
    )
    .all<DebtRow>()

  const byId = new Map<
    string,
    { account_id: string; account_name: string; cells: number[] }
  >()
  const ensure = (account_id: string, account_name: string) => {
    let row = byId.get(account_id)
    if (!row) {
      row = { account_id, account_name, cells: competences.map(() => 0) }
      byId.set(account_id, row)
    }
    return row
  }

  for (const cell of previstas.results) {
    const i = slot.get(cell.competence)
    if (i === undefined) continue
    ensure(cell.account_id, cell.account_name).cells[i] += cell.committed_cents
  }

  for (const d of dividas.results) {
    ensure(`debt:${d.debt_id}`, `Divida — ${d.title}`).cells[0] +=
      d.remaining_cents
  }

  const rows = [...byId.values()].sort((a, b) =>
    a.account_name.localeCompare(b.account_name, 'pt-BR'),
  )
  const totals = competences.map((_, i) =>
    rows.reduce((sum, r) => sum + r.cells[i], 0),
  )
  const pct_of_fixed_net = totals.map((t) =>
    fixed_net_cents > 0 ? Math.round((t * 100) / fixed_net_cents) : 0,
  )

  return { competences, rows, totals, fixed_net_cents, pct_of_fixed_net }
}
