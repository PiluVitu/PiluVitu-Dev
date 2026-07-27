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

export type CategoryRow = {
  category_id: string | null
  category_name: string
  category_slug: string | null
  total_cents: number
}

export type ByCategoryReport = {
  competence: string
  rows: CategoryRow[]
  total_cents: number
}

// Categorias sao um conjunto pequeno e controlado (hoje so as 7 seedadas na
// migration 0001 — nao existe POST /api/categories ainda, so GET /), mas
// TODA query no D1 sem LIMIT queima cota ("rows read" conta linha
// ESCANEADA) — mesmo teto usado por listTransactions() em
// domain/transactions.ts. Fica pronto pro dia em que uma categoria puder
// ser criada via API.
const BY_CATEGORY_LIMIT = 500

/**
 * "Para onde foi o dinheiro NESTE MES" — soma por categoria, mes por
 * PURCHASE_DATE (quando o FATO aconteceu), NUNCA por bill_competence (em
 * qual fatura a compra cai). Uma compra de cartao em 28/07 com fechamento
 * dia 25 tem purchase_date em julho e bill_competence em agosto —
 * responder com bill_competence seria responder a pergunta errada
 * ("o que cai na fatura que fecha em agosto"), nao a que a tela faz.
 *
 * SO DESPESA (amount_cents < 0) — fix round 1. A tela existe pra responder
 * "pra onde foi o dinheiro", nao "qual foi o saldo liquido por categoria".
 * Isto NAO e um caso futuro: hoje nao existe categoria kind='income'
 * semeada nem POST /api/categories, entao todo deposito de salario/freela
 * lancado ate a Task 5 cai no bucket "Sem categoria" SEM esta linha — e
 * netaria contra despesa real uncategorizada no mesmo mes (ex.: recebimento
 * de cliente +200000 e despesas em dinheiro -30000, ambos sem categoria,
 * viram um unico "Sem categoria: +170000", que a Task 8 desenharia como
 * GASTO num bloco literalmente chamado "pra onde foi o dinheiro"). O filtro
 * e por LINHA, antes do GROUP BY — nao um `HAVING SUM(...) < 0` nem um
 * filtro no cliente por total agregado: um `HAVING`/filtro pos-agregacao
 * decidiria por categoria-mes inteira pelo SINAL DO NET, e uma categoria de
 * despesa que fecha positiva num mes (estorno maior que o gasto real)
 * desapareceria inteira mesmo tendo gasto real dentro dela.
 */
export async function byCategory(
  db: D1Database,
  opts: { competence: string },
): Promise<ByCategoryReport> {
  // addMonthsToCompetence(x, 0) valida o formato 'YYYY-MM' (lanca RangeError
  // se ausente/malformado) e devolve a mesma competencia — reusa a mesma
  // validacao central de lib/dates.ts em vez de duplicar regex aqui. A rota
  // (routes/reports.ts) traduz esse RangeError em 400 invalid_query, mesmo
  // padrao de commitments() (ver ⚠️ da secao "Relatorio de comprometido" no
  // CLAUDE.md: query string malformada e 400, nunca 422).
  const competence = addMonthsToCompetence(opts.competence, 0)
  // addMonthsToCompetence(competence, 1) da o primeiro dia do mes SEGUINTE —
  // o limite superior (exclusivo) do intervalo. purchase_date e 'YYYY-MM-DD'
  // TEXT, e ordena lexicograficamente == cronologicamente (mesma garantia
  // usada pelos indices do schema), entao a comparacao de string funciona
  // como comparacao de data.
  const nextCompetence = addMonthsToCompetence(competence, 1)
  const from = `${competence}-01`
  const to = `${nextCompetence}-01`

  // Faixa semi-aberta (>= inicio DO mes, < inicio do mes SEGUINTE) em vez de
  // `substr(purchase_date, 1, 7) = ?` (fix round 1) — a versao com `substr`
  // aplica uma FUNCAO em cada linha antes de comparar, o que impede o D1 de
  // usar qualquer indice em purchase_date: TODA linha de `transactions` e
  // ESCANEADA (o que "rows read" cobra) em toda chamada, nao so as do mes
  // pedido, e o custo cresce com o LEDGER inteiro, nao com o mes. A faixa
  // semi-aberta e sargable e casa com idx_tx_purchase_date_expense
  // (migration 0004) — index parcial desenhado com o MESMO predicado
  // estatico desta query (amount_cents < 0 AND transfer_id/parent_id IS
  // NULL), entao o scan fica restrito as linhas que a query quer de
  // qualquer forma.
  //
  // transfer_id/parent_id IS NULL: mesmo anti-dupla-contagem de v_cashflow —
  // perna de transferencia e filha de rateio repetem o valor da outra
  // perna/do pai. GROUP BY t.category_id agrupa sozinho todo NULL na mesma
  // linha (regra padrao do SQL), o que da o bucket "Sem categoria" de graca.
  const res = await db
    .prepare(
      `SELECT c.id                             AS category_id,
              COALESCE(c.name, 'Sem categoria') AS category_name,
              c.slug                            AS category_slug,
              SUM(t.amount_cents)               AS total_cents
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.purchase_date >= ?
          AND t.purchase_date <  ?
          AND t.amount_cents  <  0
          AND t.transfer_id   IS NULL
          AND t.parent_id     IS NULL
        GROUP BY t.category_id
        ORDER BY total_cents ASC
        LIMIT ?`,
    )
    .bind(from, to, BY_CATEGORY_LIMIT)
    .all<CategoryRow>()

  const rows = res.results
  const total_cents = rows.reduce((sum, r) => sum + r.total_cents, 0)

  return { competence, rows, total_cents }
}
