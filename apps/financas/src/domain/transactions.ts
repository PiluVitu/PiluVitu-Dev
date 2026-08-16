import { billCompetence, isRealCalendarDate, nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'

export type Transaction = {
  id: string
  account_id: string
  amount_cents: number
  currency: string
  amount_original_cents: number | null
  fx_rate_ppm: number | null
  purchase_date: string
  bill_competence: string | null
  settled_at: string | null
  description: string
  payee_id: string | null
  category_id: string | null
  is_business: number
  transfer_id: string | null
  parent_id: string | null
  imported_id: string | null
  import_source: string | null
  // Task 7 da fatia ⑥ (docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md
  // §3.1): vinculo explicito com `recurring_expenses`, pra supressao EXATA
  // de dupla contagem no Comprometido — nunca heuristica (categoria+valor
  // aproximado erra em silencio). Preenchido so quando o dono diz "este
  // lancamento e o Starlink de agosto" (tela Lancar); import da fatia ②
  // pode vincular depois. NULL e o default — sem vinculo, a projecao
  // continua aparecendo (comportamento correto: sem prova, continua
  // previsto).
  recurring_expense_id: string | null
  created_at: string
  updated_at: string
}

export type NewTransaction = {
  account_id: string
  amount_cents: number
  purchase_date: string
  description: string
  bill_competence?: string | null
  settled_at?: string | null
  payee_id?: string | null
  category_id?: string | null
  is_business?: 0 | 1
  currency?: string
  amount_original_cents?: number | null
  fx_rate_ppm?: number | null
  imported_id?: string | null
  import_source?: string | null
  // Optional/nullable como payee_id/category_id: a FK
  // `REFERENCES recurring_expenses(id) ON DELETE SET NULL` (migration 0006)
  // e quem barra um id inexistente — SQLITE_CONSTRAINT_FOREIGNKEY cru, que
  // a rota (routes/transactions.ts) traduz em 422 via
  // friendlyConstraintMessage/logConstraintError, nunca chega cru ao
  // cliente. Sem pre-validacao TS aqui, mesmo padrao de payee_id/category_id
  // acima — so account_id ganha SELECT proprio porque createTransaction
  // PRECISA do `kind`/`closing_day` da conta de qualquer forma (derivacao
  // de bill_competence).
  recurring_expense_id?: string | null
}

const TX_COLUMNS = `id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
  purchase_date, bill_competence, settled_at, description, payee_id, category_id,
  is_business, transfer_id, parent_id, imported_id, import_source, recurring_expense_id,
  created_at, updated_at`

// 20 colunas => 20 bound params por linha (recurring_expense_id, Task 7 da
// fatia ⑥, somou uma). O teto real e ativo do D1 e de 100 params POR
// STATEMENT (medido), entao 1 linha por statement aqui e folgado; o
// multi-row so aparece no plano de parcelas (Task 8).
const TX_VALUES = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'

const INSERT_TX = `INSERT INTO transactions (${TX_COLUMNS}) VALUES ${TX_VALUES}`

function txBinds(
  id: string,
  input: NewTransaction,
  transfer_id: string | null,
  now: string,
): unknown[] {
  return [
    id,
    input.account_id,
    input.amount_cents,
    input.currency ?? 'BRL',
    input.amount_original_cents ?? null,
    input.fx_rate_ppm ?? null,
    input.purchase_date,
    input.bill_competence ?? null,
    input.settled_at ?? null,
    input.description,
    input.payee_id ?? null,
    input.category_id ?? null,
    input.is_business ?? 0,
    transfer_id,
    null, // parent_id: rateio e da fatia ②
    input.imported_id ?? null,
    input.import_source ?? null,
    input.recurring_expense_id ?? null,
    now,
    now,
  ]
}

export async function createTransaction(
  db: D1Database,
  input: NewTransaction,
): Promise<Transaction> {
  const account = await db
    .prepare('SELECT kind, closing_day FROM accounts WHERE id = ?')
    .bind(input.account_id)
    .first<{ kind: string; closing_day: number | null }>()
  if (!account) throw new RangeError(`conta ${input.account_id} nao existe`)

  // A regra de fechamento mora na CONTA, nunca no chamador: compra 28/07 num
  // cartao que fecha dia 25 cai na fatura '2026-08'. Fora de credit_card,
  // bill_competence fica NULL — so cartao tem fatura.
  let competence = input.bill_competence ?? null
  if (
    competence === null &&
    account.kind === 'credit_card' &&
    account.closing_day !== null
  ) {
    competence = billCompetence(input.purchase_date, account.closing_day)
  }

  const id = newId()
  const now = nowIsoUtc()
  await db
    .prepare(INSERT_TX)
    .bind(...txBinds(id, { ...input, bill_competence: competence }, null, now))
    .run()

  const row = await db
    .prepare(`SELECT ${TX_COLUMNS} FROM transactions WHERE id = ?`)
    .bind(id)
    .first<Transaction>()
  if (!row) throw new Error(`lancamento ${id} sumiu logo apos o INSERT`)
  return row
}

export async function createTransfer(
  db: D1Database,
  input: {
    from_account_id: string
    to_account_id: string
    amount_cents: number
    date: string
    description: string
  },
): Promise<{ transfer_id: string; out: Transaction; inbound: Transaction }> {
  if (input.amount_cents <= 0)
    throw new RangeError('valor da transferencia deve ser positivo')
  if (input.from_account_id === input.to_account_id) {
    throw new RangeError('transferencia exige duas contas diferentes')
  }

  const transfer_id = newId()
  const now = nowIsoUtc()
  const base = {
    purchase_date: input.date,
    settled_at: input.date,
    description: input.description,
  }

  // UM batch: se a segunda perna falhar, o D1 reverte a primeira (medido) e
  // nao sobra meia transferencia no caixa. bill_competence fica NULL de
  // proposito — transferencia ja nasce liquidada e nao entra em fatura futura.
  const res = await db.batch<Transaction>([
    db.prepare(INSERT_TX).bind(
      ...txBinds(
        newId(),
        {
          ...base,
          account_id: input.from_account_id,
          amount_cents: -input.amount_cents,
        },
        transfer_id,
        now,
      ),
    ),
    db.prepare(INSERT_TX).bind(
      ...txBinds(
        newId(),
        {
          ...base,
          account_id: input.to_account_id,
          amount_cents: input.amount_cents,
        },
        transfer_id,
        now,
      ),
    ),
    db
      .prepare(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE transfer_id = ? ORDER BY amount_cents`,
      )
      .bind(transfer_id),
  ])

  // ORDER BY amount_cents: a perna negativa (saida) vem primeiro.
  const [out, inbound] = res[2].results
  return { transfer_id, out, inbound }
}

export async function listTransactions(
  db: D1Database,
  opts: { account_id?: string; from?: string; to?: string; limit?: number },
): Promise<Transaction[]> {
  const where: string[] = []
  const binds: unknown[] = []
  if (opts.account_id) {
    where.push('account_id = ?')
    binds.push(opts.account_id)
  }
  if (opts.from) {
    where.push('purchase_date >= ?')
    binds.push(opts.from)
  }
  if (opts.to) {
    where.push('purchase_date <= ?')
    binds.push(opts.to)
  }
  // LIMIT sempre presente: no D1 "rows read" conta linha ESCANEADA, e uma
  // listagem sem teto vira cota queimada.
  const limit = Math.min(opts.limit ?? 200, 500)

  const sql = `SELECT ${TX_COLUMNS} FROM transactions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY purchase_date DESC, created_at DESC
    LIMIT ?`
  const res = await db
    .prepare(sql)
    .bind(...binds, limit)
    .all<Transaction>()
  return res.results
}

// =====================================================================
// EDITAR, APAGAR E LIQUIDAR — o que faltava do livro-caixa.
//
// A tabela `transactions` é a fonte única do dinheiro, e MEIA DÚZIA de
// outras tabelas apontam pra ela com regras de FK DIFERENTES. Apagar/editar
// uma linha sem olhar QUEM É O DONO dela é a receita de perda de dado
// silenciosa que este módulo já caçou duas vezes (o CASCADE de debts que
// deixou transaction órfã; a perna de transferência solta). O mapa medido
// contra a migration 0001:
//
//   installments.transaction_id   NOT NULL  CASCADE  (:282, uq_installments_tx)
//     => DELETE tem SUCESSO SILENCIOSO: a parcela some, o plano fica com
//        buraco (falta a seq 3 de 10) e installment_plans.installments_count
//        passa a mentir. NINGUÉM recebe erro. É o pior caso do mapa.
//   debt_payments.transaction_id            RESTRICT (:374, uq_debt_payments_tx)
//     => DELETE falha com SQLITE_CONSTRAINT cru.
//   debt_items.transaction_id               SET NULL (:350, uq_debt_items_tx)
//     => item perde o elo e sobrevive. É o desenho: a compra pode ser
//        apagada, o que eu devo continua.
//   transactions.parent_id                  CASCADE  (:187)
//     => rateio; 0 escritores hoje, alcançável amanhã.
//   transactions.transfer_id                SEM FK   (:181, coluna solta)
//     => apagar UMA perna tem sucesso e deixa a outra órfã: os saldos ficam
//        errados e v_cashflow esconde as duas (filtro transfer_id IS NULL),
//        mas accountBalances soma tudo.
//
// A política sai do precedente de deleteDebt/deleteDebtPayment: CASCATEAR
// só quando o dono e o dependente são a MESMA unidade de significado
// (as duas pernas de uma transferência nascem juntas num batch, morrem
// juntas); RECUSAR quando são unidades separadas (a parcela pertence ao
// plano, o pagamento pertence à dívida — cada um tem sua própria porta).
// =====================================================================

/**
 * Classe da linha, na ORDEM de precedência em que é decidida. Não é um
 * enum de "tipo de lançamento" pro usuário — é a resposta a "quem é o dono
 * desta linha", que decide o que pode ser editado/apagado.
 */
export type TransactionClass =
  | 'installment_line' // parcela de um plano (CASCADE silencioso)
  | 'debt_payment_line' // pagamento de dívida (RESTRICT cru)
  | 'split_child_line' // filha de rateio
  | 'split_parent_line' // pai de rateio (apagar levaria as filhas junto)
  | 'transfer_leg' // perna de transferência (a outra perna existe)
  | 'debt_item_line' // compra que virou item de dívida (SET NULL)
  | 'free' // ninguém aponta pra ela

export type TransactionOwnership = {
  class: TransactionClass
  /**
   * Linha veio de import. Não impede nada — mas quem apaga precisa saber
   * que o dedupe é `(account_id, imported_id)` (uq_tx_imported, 0001:237):
   * reimportar o MESMO arquivo traz a linha de volta.
   */
  imported: boolean
  transfer_id: string | null
}

/**
 * Recusa de REGRA (a linha tem dono), nunca "id não existe" — este segue a
 * convenção do módulo e volta como `false`/`null`. Mesma família de
 * DebtHasLedgerError: a MENSAGEM mora aqui, no domínio, e o `mapError` da
 * rota a repassa crua. Uma recusa que só diz "não" deixa o dono travado;
 * cada mensagem abaixo nomeia a porta certa.
 */
export class TransactionHasOwnerError extends Error {
  code: TransactionClass
  constructor(code: TransactionClass, message: string) {
    super(message)
    this.name = 'TransactionHasOwnerError'
    this.code = code
  }
}

type OwnerProbeRow = {
  account_id: string
  purchase_date: string
  transfer_id: string | null
  parent_id: string | null
  imported_id: string | null
  de_parcela: number | null
  de_pagamento: number | null
  de_item: number | null
  de_pai_de_rateio: number | null
}

/**
 * UMA query. Cada subconsulta bate em índice único
 * (uq_installments_tx / uq_debt_payments_tx / uq_debt_items_tx) ou parcial
 * (idx_tx_parent) — zero scan, mesmo com o livro-caixa crescido. Fazer isto
 * em 4 round-trips seria 4x o custo de "rows read" pra responder uma
 * pergunta só.
 */
async function probeOwner(
  db: D1Database,
  id: string,
): Promise<OwnerProbeRow | null> {
  return db
    .prepare(
      `SELECT t.account_id, t.purchase_date, t.transfer_id, t.parent_id, t.imported_id,
              (SELECT 1 FROM installments  WHERE transaction_id = t.id) AS de_parcela,
              (SELECT 1 FROM debt_payments WHERE transaction_id = t.id) AS de_pagamento,
              (SELECT 1 FROM debt_items    WHERE transaction_id = t.id) AS de_item,
              (SELECT 1 FROM transactions  WHERE parent_id      = t.id) AS de_pai_de_rateio
         FROM transactions t
        WHERE t.id = ?`,
    )
    .bind(id)
    .first<OwnerProbeRow>()
}

function classify(row: OwnerProbeRow): TransactionClass {
  // Ordem = severidade. As três primeiras recusam tudo que é estrutural;
  // transfer_leg cascateia; debt_item_line passa avisando.
  if (row.de_parcela) return 'installment_line'
  if (row.de_pagamento) return 'debt_payment_line'
  if (row.parent_id !== null) return 'split_child_line'
  if (row.de_pai_de_rateio) return 'split_parent_line'
  if (row.transfer_id !== null) return 'transfer_leg'
  if (row.de_item) return 'debt_item_line'
  return 'free'
}

/**
 * Quem é o dono desta linha — pra tela poder AVISAR antes de apagar
 * (`debt_item_line` e `imported` são permitidos, mas com consequência que o
 * dono precisa saber) e pra desabilitar campo que não dá pra editar.
 * `null` quando o id não existe.
 */
export async function inspectTransaction(
  db: D1Database,
  id: string,
): Promise<TransactionOwnership | null> {
  const row = await probeOwner(db, id)
  if (!row) return null
  return {
    class: classify(row),
    imported: row.imported_id !== null,
    transfer_id: row.transfer_id,
  }
}

const RECUSA_DELETE: Partial<Record<TransactionClass, string>> = {
  installment_line:
    'Este lançamento é uma parcela de um parcelamento. Apagar só ela abriria um buraco no plano (ficaria faltando uma parcela do meio) e o total do parcelamento passaria a mentir, sem nenhum aviso. Cancele o parcelamento inteiro.',
  debt_payment_line:
    'Este lançamento é o pagamento de uma dívida. Apague pelo pagamento (DELETE /api/debts/:id/payments/:paymentId) para que a dívida e as alocações sejam desfeitas junto.',
  split_child_line:
    'Este lançamento é uma parte de um rateio. Apague o lançamento pai — apagar só a parte deixaria o rateio sem bater com o valor cheio.',
  split_parent_line:
    'Este lançamento é o pai de um rateio: apagá-lo apagaria junto, em silêncio, todas as partes rateadas. Apague as partes primeiro.',
}

const RECUSA_EDICAO: Record<TransactionClass, string> = {
  installment_line:
    'Valor, data e conta de uma parcela não podem ser editados: a soma das parcelas tem que continuar igual ao total do parcelamento. Descrição, pessoa, categoria e PJ/PF continuam editáveis.',
  debt_payment_line:
    'Valor, data e conta do pagamento de uma dívida não podem ser editados aqui: divergiriam do valor registrado na própria dívida. Apague o pagamento e registre de novo. Descrição, pessoa, categoria e PJ/PF continuam editáveis.',
  split_child_line:
    'Valor, data e conta de uma parte de rateio não podem ser editados: a soma das partes tem que continuar igual ao lançamento pai.',
  split_parent_line:
    'Valor, data e conta do pai de um rateio não podem ser editados: as partes já foram distribuídas a partir dele.',
  transfer_leg:
    'Valor, data e conta de uma transferência não podem ser editados por aqui: as duas pernas têm que continuar espelhadas. Apague a transferência e registre de novo. Descrição, pessoa, categoria e PJ/PF continuam editáveis.',
  debt_item_line:
    'Valor, data e conta desta compra não podem ser editados: ela é o item de uma dívida, e o valor divergiria do que está registrado lá.',
  free: '',
}

/**
 * NÍVEL A — rótulos. Nenhum invariante depende deles, então valem para
 * QUALQUER linha, inclusive parcela e pagamento de dívida: corrigir a
 * descrição ou classificar a categoria de uma parcela é exatamente o que o
 * dono precisa fazer, e não mexe em nenhuma soma.
 */
const LABEL_FIELDS = [
  'description',
  'payee_id',
  'category_id',
  'is_business',
  'recurring_expense_id',
] as const

/**
 * NÍVEL B — estrutura. Só em linha LIVRE:
 *  - `amount_cents` numa parcela quebra SUM(parcelas) = total_cents
 *    (invariante de installment_plans, 0001:250-253); num pagamento de
 *    dívida diverge de debt_payments.amount_cents.
 *  - `purchase_date`/`account_id` mudam a FATURA em que a linha cai — por
 *    isso obrigam a RE-DERIVAR bill_competence (abaixo).
 */
const STRUCTURAL_FIELDS = [
  'amount_cents',
  'purchase_date',
  'account_id',
] as const

export type TransactionPatch = Partial<{
  description: string
  payee_id: string | null
  category_id: string | null
  is_business: 0 | 1
  recurring_expense_id: string | null
  amount_cents: number
  purchase_date: string
  account_id: string
}>

const PATCHABLE_FIELDS = [
  ...LABEL_FIELDS,
  ...STRUCTURAL_FIELDS,
] as const satisfies readonly (keyof TransactionPatch)[]

function readTransaction(
  db: D1Database,
  id: string,
): Promise<Transaction | null> {
  return db
    .prepare(`SELECT ${TX_COLUMNS} FROM transactions WHERE id = ?`)
    .bind(id)
    .first<Transaction>()
}

/**
 * Update parcial por whitelist, em DOIS níveis (ver LABEL_FIELDS /
 * STRUCTURAL_FIELDS acima). Devolve `null` para id inexistente — mesma
 * convenção de updateRecurring/archiveAccount; a rota traduz em 404.
 * Lança TransactionHasOwnerError quando um campo de nível B é tentado numa
 * linha que tem dono.
 *
 * ⚠️ Mudar `purchase_date` OU `account_id` RE-DERIVA `bill_competence` com
 * a MESMA `billCompetence(purchase_date, closing_day)` que
 * `createTransaction` usa — nunca uma segunda regra. Sem isto, corrigir a
 * data de uma compra de cartão deixaria a linha na fatura ERRADA em
 * silêncio (o pior tipo de defeito deste módulo: o número muda de lugar sem
 * ninguém ver). `bill_competence` de propósito NÃO é patchável direto: ela é
 * derivada, e um segundo caminho de escrita poderia contradizer a conta.
 */
export async function updateTransaction(
  db: D1Database,
  id: string,
  patch: TransactionPatch,
): Promise<Transaction | null> {
  const probe = await probeOwner(db, id)
  if (!probe) return null

  const fields = PATCHABLE_FIELDS.filter((f) => f in patch)
  if (fields.length === 0) return readTransaction(db, id)

  const mexeNaEstrutura = STRUCTURAL_FIELDS.some((f) => f in patch)
  const classe = classify(probe)
  if (mexeNaEstrutura && classe !== 'free') {
    throw new TransactionHasOwnerError(classe, RECUSA_EDICAO[classe])
  }

  const sets = fields.map((f) => `${f} = ?`)
  const values: unknown[] = fields.map((f) => patch[f] ?? null)

  if ('purchase_date' in patch || 'account_id' in patch) {
    const account_id = patch.account_id ?? probe.account_id
    const purchase_date = patch.purchase_date ?? probe.purchase_date
    const account = await db
      .prepare('SELECT kind, closing_day FROM accounts WHERE id = ?')
      .bind(account_id)
      .first<{ kind: string; closing_day: number | null }>()
    if (!account) throw new RangeError(`conta ${account_id} nao existe`)

    sets.push('bill_competence = ?')
    values.push(
      account.kind === 'credit_card' && account.closing_day !== null
        ? billCompetence(purchase_date, account.closing_day)
        : null,
    )
  }

  // updated_at existia e só era escrito no INSERT — um UPDATE que não o
  // tocasse deixaria a linha mentindo sobre quando foi mexida.
  const now = nowIsoUtc()
  const res = await db
    .prepare(
      `UPDATE transactions SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
    )
    .bind(...values, now, id)
    .run()
  if (res.meta.changes === 0) return null

  return readTransaction(db, id)
}

/**
 * Marcar como pago. Transição de ESTADO, com rota própria — nunca um campo
 * do PATCH genérico: "já saiu da conta" é uma pergunta diferente de "corrigi
 * a categoria", e misturá-las faria um patch de rótulo poder liquidar uma
 * linha por acidente.
 *
 * Efeitos exatos (medidos contra as queries que existem hoje):
 *   commitments() (reports.ts:69 filtra settled_at IS NULL) => a linha SAI
 *     do Comprometido;
 *   cashflow()    (cashflow.ts:92 exige NOT NULL)           => a linha ENTRA
 *     no entrou/saiu;
 *   accountBalances() => nenhum efeito (soma sem olhar settled_at);
 *   byCategory()      => nenhum efeito (agrupa por purchase_date).
 *
 * ⚠️ `settled_at` é DATA PURA 'YYYY-MM-DD', local — o mesmo formato que os
 * dois únicos escritores anteriores usam (createTransfer aqui neste arquivo,
 * payDebt em debts.ts). Não é o instante do clique: "marquei como pago no
 * dia X" é uma data que o dono ESCOLHE. Um timestamp UTC aqui cairia no
 * outro ramo de cashflow.ts:40-43 (`settledAt.includes('T')`) e, no dia 1 de
 * cada mês, jogaria a linha pro mês errado.
 *
 * Devolve `boolean` de meta.changes (convenção do módulo — ver
 * archiveAccount): id inexistente e linha JÁ liquidada casam zero vezes com
 * o WHERE, e sem isso os dois ficariam indistinguíveis de um sucesso.
 */
export async function settleTransaction(
  db: D1Database,
  id: string,
  settled_at: string,
): Promise<boolean> {
  if (!isRealCalendarDate(settled_at)) {
    throw new RangeError(
      `settled_at inválido: ${settled_at} (esperado data pura YYYY-MM-DD que exista no calendário, nunca timestamp)`,
    )
  }
  const now = nowIsoUtc()
  const res = await db
    .prepare(
      'UPDATE transactions SET settled_at = ?, updated_at = ? WHERE id = ? AND settled_at IS NULL',
    )
    .bind(settled_at, now, id)
    .run()
  return res.meta.changes > 0
}

/** Desmarcar: a linha volta a ser PREVISTA (volta pro Comprometido, sai do fluxo). */
export async function unsettleTransaction(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const now = nowIsoUtc()
  const res = await db
    .prepare(
      'UPDATE transactions SET settled_at = NULL, updated_at = ? WHERE id = ? AND settled_at IS NOT NULL',
    )
    .bind(now, id)
    .run()
  return res.meta.changes > 0
}

/**
 * Apagar, com a política por classe descrita no cabeçalho desta seção.
 * `false` = id não existe (convenção do módulo, a rota traduz em 404);
 * TransactionHasOwnerError = existe, mas tem dono que não permite.
 *
 * Permitidos, com consequência que a TELA precisa avisar antes (use
 * `inspectTransaction`, não dá pra dizer isso por um boolean):
 *   - `debt_item_line`: o item da dívida sobrevive com transaction_id NULL —
 *     é o desenho (SET NULL), mas o elo com o caixa se perde.
 *   - `imported`: apagar funciona, e reimportar o MESMO arquivo TRAZ A LINHA
 *     DE VOLTA, porque o dedupe é por (account_id, imported_id).
 */
export async function deleteTransaction(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const probe = await probeOwner(db, id)
  if (!probe) return false

  const classe = classify(probe)
  const recusa = RECUSA_DELETE[classe]
  if (recusa) throw new TransactionHasOwnerError(classe, recusa)

  if (probe.transfer_id !== null) {
    // As DUAS pernas, sempre. createTransfer as cria juntas num batch()
    // justamente porque meia transferência é o defeito; apagar meia seria
    // o mesmo defeito pelo outro lado — transfer_id não tem FK (coluna
    // solta, 0001:181), então ninguém no banco impediria.
    //
    // UM statement em vez de um batch() de dois DELETEs: um único statement
    // já é atômico por definição (não há meio caminho a desfazer), usa
    // idx_tx_transfer, e não deixa espaço pra um segundo DELETE mirar o id
    // errado. batch() só seria necessário se fossem dois statements.
    const res = await db
      .prepare('DELETE FROM transactions WHERE transfer_id = ?')
      .bind(probe.transfer_id)
      .run()
    return res.meta.changes > 0
  }

  const res = await db
    .prepare('DELETE FROM transactions WHERE id = ?')
    .bind(id)
    .run()
  return res.meta.changes > 0
}
