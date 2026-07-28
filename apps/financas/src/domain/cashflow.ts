import { addMonthsToCompetence, todayInTeresina } from '../lib/dates'

export type CashflowRow = {
  competence: string
  entrou_cents: number
  saiu_cents: number
  saldo_cents: number
  acumulado_cents: number
}

export type CashflowReport = {
  meses: string[]
  linhas: CashflowRow[]
}

const COMPETENCE_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// Mesmo teto defensivo de listTransactions()/byCategory(): no D1 "rows
// read" conta linha ESCANEADA, entao qualquer query que pode crescer com o
// tempo leva um LIMIT. O pre-filtro de data (ver abaixo) ja restringe a
// janela pedida; isto e so o teto duro contra um mes com uma quantidade
// patologica de lancamentos.
const CASHFLOW_LIMIT = 5000

/**
 * Mes LOCAL (Teresina, UTC-3) de um settled_at.
 *
 * ⚠️ settled_at nem sempre carrega hora: createTransfer()/payDebt() gravam
 * so a data ('YYYY-MM-DD', ja LOCAL — mesma convencao de purchase_date),
 * enquanto um settled_at completo ('YYYY-MM-DDTHH:MM:SSZ') e um instante
 * UTC de verdade. So o segundo caso precisa do deslocamento de Teresina;
 * aplicar o deslocamento numa data sem hora tratando-a como meia-noite UTC
 * empurraria o dia pra TRAS (21h do dia anterior), o mesmo bug que este
 * modulo existe pra evitar, so que na direcao oposta.
 *
 * Reusa todayInTeresina() (mesma aritmetica de deslocamento de sempre,
 * lib/dates.ts) em vez de reescrever a conta — so corta mais um pedaco do
 * resultado (mes em vez de dia).
 */
function localCompetence(settledAt: string): string {
  if (!settledAt.includes('T')) return settledAt.slice(0, 7)
  return todayInTeresina(new Date(settledAt)).slice(0, 7)
}

/**
 * Mapa de fluxo de caixa — entrou/saiu/saldo/acumulado por mes, a partir de
 * v_cashflow (settled_at IS NOT NULL, sem perna de transferencia, sem
 * filha de rateio). NAO usa a coluna competence_month da view: ela sai de
 * `substr(settled_at, 1, 7)` sobre um valor UTC, o que desloca lancamento
 * de fim/inicio de mes pro mes errado quando ha hora registrada (ver
 * localCompetence acima). O calculo aqui aplica o deslocamento de Teresina
 * ANTES de cortar o mes.
 */
export async function cashflow(
  db: D1Database,
  opts: { from: string; months: number },
): Promise<CashflowReport> {
  const { from, months } = opts

  if (!COMPETENCE_RE.test(from)) {
    throw new RangeError(`competencia invalida: ${from} (esperado 'YYYY-MM')`)
  }
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new RangeError(
      `months invalido: ${months} (esperado inteiro entre 1 e 24)`,
    )
  }

  const meses = Array.from({ length: months }, (_, i) =>
    addMonthsToCompetence(from, i),
  )
  const slot = new Map(meses.map((c, i) => [c, i]))

  // Pre-filtro de data: sobre-inclusivo de proposito, nunca sub-inclusivo.
  // Teresina e UTC-3 (offset so anda pra FRENTE: UTC = local + 3h), entao o
  // instante UTC de qualquer settled_at que caia dentro da janela local
  // [from, from+months) tem a DATA UTC entre o 1o dia da janela e o dia
  // SEGUINTE ao ultimo dia da janela (nunca antes). Como o limite superior
  // e sempre "dia 1 + 1 dia" = "dia 2" do mes seguinte a janela, nao ha
  // aritmetica de fim-de-mes pra fazer aqui. Linhas fora da janela real que
  // passem por este filtro largo sao descartadas abaixo, no agrupamento
  // exato por localCompetence() — o filtro so limita o SCAN, quem decide
  // o mes final e sempre o calculo em JS.
  const endCompetence = addMonthsToCompetence(from, months)
  const lowerBound = `${from}-01`
  const upperBound = `${endCompetence}-02`

  const res = await db
    .prepare(
      `SELECT amount_cents, settled_at
         FROM transactions
        WHERE settled_at  IS NOT NULL
          AND transfer_id IS NULL
          AND parent_id   IS NULL
          AND settled_at >= ?
          AND settled_at <  ?
        LIMIT ?`,
    )
    .bind(lowerBound, upperBound, CASHFLOW_LIMIT)
    .all<{ amount_cents: number; settled_at: string }>()

  const entrou = meses.map(() => 0)
  const saiu = meses.map(() => 0)

  for (const row of res.results) {
    const i = slot.get(localCompetence(row.settled_at))
    if (i === undefined) continue
    if (row.amount_cents > 0) entrou[i] += row.amount_cents
    else saiu[i] += -row.amount_cents
  }

  // O acumulado PARTE do saldo de abertura das contas, nunca de zero —
  // comecar em zero desenharia uma curva subindo do nada, sem corresponder
  // a dinheiro nenhum. Mesma soma de accountBalances() (domain/accounts.ts),
  // sem filtrar arquivada: opening_balance_cents e um valor fixo por conta,
  // nao muda com o status de arquivamento.
  const abertura = await db
    .prepare(
      'SELECT COALESCE(SUM(opening_balance_cents), 0) AS total FROM accounts',
    )
    .first<{ total: number }>()

  let acumulado = abertura?.total ?? 0
  const linhas: CashflowRow[] = meses.map((competence, i) => {
    const saldo_cents = entrou[i] - saiu[i]
    acumulado += saldo_cents
    return {
      competence,
      entrou_cents: entrou[i],
      saiu_cents: saiu[i],
      saldo_cents,
      acumulado_cents: acumulado,
    }
  })

  return { meses, linhas }
}
