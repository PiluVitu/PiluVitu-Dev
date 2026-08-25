import {
  addMonthsToCompetence,
  billCompetence,
  isRealCalendarDate,
  nowIsoUtc,
} from '../lib/dates'
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

/**
 * Mesmo INSERT, mas **condicionado a ainda existir fatura a pagar**.
 *
 * ⚠️ Existe por um defeito MEDIDO em `payBill`: a checagem de `already_paid`
 * era uma LEITURA fora do batch, então duas chamadas CONCORRENTES passavam as
 * duas. Reproduzido com `Promise.allSettled` de dois `payBill` idênticos:
 * ambas resolveram, **4 pernas** gravadas, o cartão terminou **positivo**
 * (+150000) e a corrente perdeu R$ 1.500 **duas vezes**.
 *
 * ⚠️ E nenhum relatório denunciava: o consolidado continua batendo (o dinheiro
 * "mudou de lugar" duas vezes), então o erro só apareceria olhando o saldo do
 * cartão e estranhando o sinal.
 *
 * O `WHERE EXISTS` põe a decisão DENTRO do batch, que no D1 é transação: duas
 * chamadas serializam, e a segunda não acha linha não-liquidada — nenhuma
 * perna nasce. O `UPDATE` seguinte já era `WHERE settled_at IS NULL`, então a
 * liquidação sempre esteve protegida; quem não estava era o DINHEIRO.
 */
const INSERT_TX_SE_HA_FATURA = `INSERT INTO transactions (${TX_COLUMNS})
  SELECT ${TX_VALUES.slice(1, -1)}
   WHERE EXISTS (
     SELECT 1 FROM transactions
      WHERE account_id      = ?
        AND bill_competence = ?
        AND settled_at      IS NULL
        AND transfer_id     IS NULL
        AND parent_id       IS NULL
   )`

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

/**
 * ⚠️ Arquivada RECUSA; inexistente NAO — e a assimetria e a regra.
 *
 * "Nao existe" ja tem DONO UNICO: a FK `transactions.category_id REFERENCES
 * categories(id)`. Ela barra igual em `POST /transactions` e em
 * `POST /transfers`, e a rota traduz o SQLITE_CONSTRAINT em 422
 * `constraint_violation` com mensagem cozida. Lancar RangeError aqui pro id
 * inexistente faria o MESMO payload errado responder codigos diferentes
 * dependendo da rota — divergencia sem ganho nenhum.
 *
 * "Arquivada" nao tem dono nenhum: categoria neste app se ARQUIVA, nao se
 * apaga (`archiveCategory` e um UPDATE de `archived_at`), entao a FK nunca
 * dispara — ela so olha DELETE. E `listCategories` esconde arquivada, logo a
 * tela nunca a oferece: um id arquivado chegando aqui e sempre estado velho
 * (cliente desatualizado, payload montado a mao). Aceitar em silencio e
 * exatamente o defeito ja pago em `6ba822c` — a linha nasce numa categoria
 * que NENHUMA tela lista, invisivel no relatorio, sem erro nenhum.
 *
 * Diferente da regra que aponta pra categoria arquivada (que a tela MANTEM,
 * porque a regra ja existia e continua correta), aqui a linha esta NASCENDO:
 * nao ha estado bom anterior a preservar, e criar dado novo apontando pra
 * algo que o dono arquivou de proposito nunca e o que ele quis.
 *
 * A mensagem nao promete desarquivar — nao existe rota de desarquivamento
 * (`archived_at` so e escrito, nunca limpo); manda escolher categoria ativa.
 */
async function assertCategoriaUsavel(
  db: D1Database,
  category_id: string,
): Promise<void> {
  const cat = await db
    .prepare('SELECT archived_at FROM categories WHERE id = ?')
    .bind(category_id)
    .first<{ archived_at: string | null }>()
  if (cat === null) return
  if (cat.archived_at !== null) {
    throw new RangeError(
      `categoria ${category_id} esta arquivada — escolha uma categoria ativa`,
    )
  }
}

/**
 * ⚠️ `category_id` vai SO NA PERNA DE SAIDA, nunca nas duas — e o motivo e o
 * modo de falha da alternativa, nao simetria estetica.
 *
 * Com a categoria nas DUAS pernas, a consulta mais obvia que alguem
 * escreveria pra responder "quanto tirei de pro-labore este ano?" —
 * `SELECT SUM(amount_cents) ... GROUP BY category_id` — devolve ZERO: as duas
 * pernas tem o mesmo valor com sinais opostos e se cancelam. Zero e um numero
 * plausivel ("nao tirei nada"), entao a resposta errada nao PARECE errada, e
 * acertar passaria a exigir que TODO consumidor futuro lembrasse de filtrar
 * `amount_cents < 0`. Com a categoria so na saida, a consulta ingenua ja
 * devolve o total certo, e a com filtro de sinal tambem — as duas acertam.
 *
 * O que a perna de entrada perde nao e recuperavel? E: ela carrega o mesmo
 * `transfer_id`, entao "o que entrou na PF como pro-labore" e um JOIN pela
 * outra perna. Categorizar aqui e classificar a NATUREZA da saida ("este
 * dinheiro saiu da PJ como pro-labore"); a entrada e a mesma movimentacao
 * chegando, ja descrita pela contraparte.
 *
 * ⚠️ NAO se exige `kind = 'transfer'` na categoria, de proposito. O risco de
 * nao exigir e cosmetico e MEDIDO: `cashflow()`, `commitments()` e
 * `byCategory()` filtram `transfer_id IS NULL`, entao uma perna marcada como
 * "Alimentacao" nao infla relatorio nenhum — e nonsense inerte. Ja o risco de
 * exigir e concreto: a tela de categorias so cria `expense`/`income` (as duas
 * classes estruturais ficam de fora de proposito, ver `pages/categorias.tsx`),
 * entao exigir `transfer` prenderia o dono pra sempre nas DUAS linhas
 * semeadas (`Pro-labore`, `Transferencia entre contas`) — um "Aporte" novo
 * exigiria SQL manual. Recusar o util pra impedir o inofensivo e a troca
 * errada.
 */
export async function createTransfer(
  db: D1Database,
  input: {
    from_account_id: string
    to_account_id: string
    amount_cents: number
    date: string
    description: string
    category_id?: string | null
  },
): Promise<{ transfer_id: string; out: Transaction; inbound: Transaction }> {
  if (input.amount_cents <= 0)
    throw new RangeError('valor da transferencia deve ser positivo')
  if (input.from_account_id === input.to_account_id) {
    throw new RangeError('transferencia exige duas contas diferentes')
  }

  const category_id = input.category_id ?? null
  if (category_id !== null) await assertCategoriaUsavel(db, category_id)

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
          category_id,
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

/**
 * Cursor de keyset do extrato. As TRÊS colunas, sempre — ver
 * `buildListTransactionsQuery` para o porquê de `id` não ser opcional.
 */
export type TransactionCursor = {
  purchase_date: string
  created_at: string
  id: string
}

export type ListTransactionsOpts = {
  account_id?: string
  from?: string
  to?: string
  limit?: number
  /** 1 = já liquidado; 0 = ainda não ("o que falta marcar como pago"). */
  settled?: 0 | 1
  /** Página seguinte: só linhas ESTRITAMENTE anteriores a este cursor. */
  before?: TransactionCursor
}

/**
 * Monta a query do extrato. Exportada (e não só usada por
 * `listTransactions`) porque o teste de PLANO — o que garante que o índice
 * `idx_tx_purchase_date` (migration 0008) continua sendo usado e que não
 * sobrou nenhum `USE TEMP B-TREE FOR ORDER BY` — precisa rodar
 * `EXPLAIN QUERY PLAN` sobre o SQL REAL. Uma cópia do SQL dentro do teste
 * passaria a valer sozinha no dia em que esta função mudasse.
 *
 * ⚠️ PAGINAÇÃO É KEYSET, NUNCA `OFFSET`. No D1 "rows read" conta linha
 * ESCANEADA: `OFFSET n` obriga o motor a percorrer e descartar as n linhas
 * anteriores, então a página 10 custa 10x a página 1 e o preço cresce
 * enquanto o livro-caixa cresce. O cursor entra no `WHERE` e o índice
 * SALTA direto pra borda (MEDIDO por EXPLAIN QUERY PLAN:
 * `SEARCH transactions USING INDEX idx_tx_purchase_date
 * ((purchase_date,created_at,id)<(?,?,?))`).
 *
 * ⚠️ O CURSOR TEM TRÊS PARTES PORQUE `(purchase_date, created_at)` NÃO É
 * ÚNICO — e isso não é hipótese: `createInstallmentPlan`
 * (domain/installments.ts) grava as N parcelas com o MESMO `purchase_date`
 * (o da compra) e o MESMO `created_at` (um `nowIsoUtc()` só pro batch
 * inteiro), e `createTransfer` faz igual com as duas pernas. Com cursor de
 * duas partes, uma página que termina NO MEIO desse grupo pede a seguinte a
 * partir de um par que TODO o resto do grupo também tem — e o `<` estrito
 * descarta os irmãos: parcela sumindo do extrato, sem erro nenhum. `id`
 * (TEXT PRIMARY KEY) fecha a ordem total.
 *
 * A comparação é ROW VALUE (`(a,b,c) < (?,?,?)`), não a cadeia de OR
 * equivalente: MEDIDO que o SQLite do D1 a resolve como um seek único no
 * índice de 3 colunas; a cadeia de OR desmonta esse seek.
 */
export function buildListTransactionsQuery(opts: ListTransactionsOpts): {
  sql: string
  binds: unknown[]
} {
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
  if (opts.settled === 1) where.push('settled_at IS NOT NULL')
  if (opts.settled === 0) where.push('settled_at IS NULL')
  if (opts.before) {
    where.push('(purchase_date, created_at, id) < (?, ?, ?)')
    binds.push(
      opts.before.purchase_date,
      opts.before.created_at,
      opts.before.id,
    )
  }
  // LIMIT sempre presente: no D1 "rows read" conta linha ESCANEADA, e uma
  // listagem sem teto vira cota queimada.
  binds.push(Math.min(opts.limit ?? 200, 500))

  return {
    sql: `SELECT ${TX_COLUMNS} FROM transactions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY purchase_date DESC, created_at DESC, id DESC
    LIMIT ?`,
    binds,
  }
}

export async function listTransactions(
  db: D1Database,
  opts: ListTransactionsOpts,
): Promise<Transaction[]> {
  const { sql, binds } = buildListTransactionsQuery(opts)
  const res = await db
    .prepare(sql)
    .bind(...binds)
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

// ---------------------------------------------------------------------------
// PAGAR A FATURA DO CARTÃO
//
// ⚠️ Pagar fatura NÃO é marcar `settled_at`, e não é uma transferência — é as
// DUAS COISAS, numa operação só. O motivo é medido, não teórico:
//
//   - `accountBalances` soma `amount_cents` SEM olhar `settled_at`, então o
//     saldo do cartão já é negativo no instante da compra (MEDIDO: 3 compras
//     de R$ 250 => cartão -25000). Só liquidar as linhas deixaria o cartão
//     negativo PARA SEMPRE e o dinheiro nunca sairia da corrente.
//   - Lançar o pagamento como despesa nova contaria o gasto DUAS vezes: uma
//     na compra, outra no pagamento.
//   - Só transferir (sem liquidar) é o defeito que já bloqueou cartão nos
//     selects de `pages/transferir.tsx`: `accountBalances` leva o cartão a 0
//     (a tela Contas diz "pago") enquanto `commitments()` continua devolvendo
//     a competência inteira (o Comprometido diz "devendo") — a MESMA
//     obrigação lida de dois jeitos opostos.
//
// A forma que fecha é a transferência (corrente -> cartão, com `transfer_id`,
// que todo relatório de resultado exclui) MAIS a liquidação das linhas daquela
// competência, num `db.batch()` só.
//
// ⚠️ `createTransfer` NÃO recusa conta `credit_card` — MEDIDO lendo a função:
// ela só valida `amount_cents > 0` e contas diferentes, sem nenhuma checagem
// de `kind`. O bloqueio de cartão que existe hoje é da TELA
// (`pages/transferir.tsx`), não do domínio. Já `payDebt` (`domain/debts.ts`)
// recusa cartão, mas por um motivo DIFERENTE e que não se aplica aqui: ela
// grava `settled_at = paid_on` e `bill_competence = null`
// INCONDICIONALMENTE, regra que só vale para dinheiro/conta corrente — num
// cartão isso apagaria a obrigação futura sem o dinheiro ter saído. Aqui a
// liquidação é justamente o ponto, e ela é explícita.
// ---------------------------------------------------------------------------

export type PayBillCode =
  | 'invalid_account'
  | 'no_lines'
  | 'already_paid'
  | 'nothing_to_pay'
  | 'amount_mismatch'

/**
 * Recusa de regra de negócio ao pagar fatura. Mesma família de
 * `TransactionHasOwnerError`/`DebtHasLedgerError`: a MENSAGEM mora no domínio
 * (que é quem sabe nomear a porta certa) e a rota a repassa crua.
 */
export class PayBillError extends Error {
  code: PayBillCode
  constructor(code: PayBillCode, message: string) {
    super(message)
    this.name = 'PayBillError'
    this.code = code
  }
}

export type PayBillInput = {
  /** Conta do cartão cuja fatura está sendo paga. */
  card_account_id: string
  /** Competência da fatura (`YYYY-MM`), o mês em que ela FECHA. */
  competence: string
  /** Data do pagamento, escolhida pelo dono (nunca o instante do clique). */
  paid_on: string
  /** Conta de onde o dinheiro sai (corrente/poupança/dinheiro). */
  from_account_id: string
  /**
   * CONFIRMAÇÃO do valor, nunca pagamento parcial — ver a nota sobre parcial
   * logo abaixo. Quando presente e diferente do total em aberto da
   * competência, a operação é RECUSADA nomeando o total real: protege contra
   * a tela mandar um número velho (uma compra importada entre a renderização
   * e o toque mudaria o total sem o dono perceber).
   */
  expected_amount_cents?: number
}

export type PayBillResult = {
  transfer_id: string
  /** Valor de fato pago (o total em aberto da competência). */
  amount_cents: number
  /** Quantas linhas da fatura foram liquidadas. */
  settled_count: number
  competence: string
  out: Transaction
  inbound: Transaction
}

/**
 * Paga a fatura de UMA competência: transfere `from_account_id -> cartão` e
 * liquida, no MESMO batch, todas as linhas em aberto daquela competência.
 *
 * ⚠️ PAGAMENTO PARCIAL NÃO ENTRA NESTA FATIA, e a razão é estrutural, não
 * falta de tempo. `settled_at` é POR LINHA e binário: não existe "meia linha
 * liquidada". Pagar R$ 100 de uma fatura de R$ 250 não tem mapeamento
 * principiado para um subconjunto de linhas (quais? as mais antigas? as
 * menores? qualquer escolha é arbitrária e o dono não a controla), e a
 * alternativa — transferir os R$ 100 sem liquidar nada — reintroduz
 * EXATAMENTE o defeito das duas vozes que bloqueou cartão em
 * `pages/transferir.tsx` (saldo diz que caiu, Comprometido diz que não).
 * Suportar parcial de verdade exige a entidade Bill (uma fatura com
 * pagamentos próprios), que o roadmap já registra como ausente. Até lá, esta
 * operação paga a competência INTEIRA ou recusa — nunca deixa um estado
 * intermediário que nenhuma tela sabe ler.
 *
 * ⚠️ IDEMPOTÊNCIA: pagar a mesma fatura duas vezes é RECUSADO
 * (`already_paid`), nunca um no-op silencioso. A recusa acontece ANTES do
 * batch (a checagem é uma leitura), então a segunda chamada não escreve nada
 * — não há meia operação possível. Recusar é melhor que devolver sucesso
 * inócuo porque o dinheiro da PRIMEIRA chamada já se moveu de verdade: um
 * "ok" mudo no segundo toque seria indistinguível de um pagamento novo, e é
 * justamente o duplo-toque que esta guarda existe pra tornar visível. E é
 * seguro por construção: a liquidação é `WHERE settled_at IS NULL`, então
 * mesmo que a checagem fosse contornada o UPDATE casaria zero linhas.
 */
export async function payBill(
  db: D1Database,
  input: PayBillInput,
): Promise<PayBillResult> {
  const { card_account_id, competence, paid_on, from_account_id } = input

  // Valida a competência reusando a aritmética central de lib/dates
  // (addMonthsToCompetence com n=0 lança RangeError para formato/mês
  // inválido) — nunca uma segunda regex, mesmo padrão de byCategory.
  addMonthsToCompetence(competence, 0)

  if (!isRealCalendarDate(paid_on)) {
    throw new RangeError(
      `paid_on inválido: ${paid_on} (esperado data pura YYYY-MM-DD que exista no calendário, nunca timestamp)`,
    )
  }

  if (card_account_id === from_account_id) {
    throw new PayBillError(
      'invalid_account',
      'a conta de origem não pode ser o próprio cartão — o dinheiro precisa sair de outra conta (corrente, poupança ou dinheiro)',
    )
  }

  const card = await db
    .prepare('SELECT kind FROM accounts WHERE id = ?')
    .bind(card_account_id)
    .first<{ kind: string }>()
  if (!card)
    throw new PayBillError('invalid_account', 'conta do cartão não encontrada')
  if (card.kind !== 'credit_card') {
    throw new PayBillError(
      'invalid_account',
      'só conta de cartão de crédito tem fatura — para mover dinheiro entre outras contas use uma transferência',
    )
  }

  // UMA leitura responde as três perguntas (existe? já foi paga? quanto?):
  // no D1 "rows read" conta linha escaneada, e três queries custariam três
  // varreduras da mesma competência.
  const resumo = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN settled_at IS NULL THEN 1 ELSE 0 END) AS em_aberto,
              COALESCE(SUM(CASE WHEN settled_at IS NULL THEN amount_cents ELSE 0 END), 0) AS soma_aberta
         FROM transactions
        WHERE account_id      = ?
          AND bill_competence = ?
          AND transfer_id     IS NULL
          AND parent_id       IS NULL`,
    )
    .bind(card_account_id, competence)
    .first<{ total: number; em_aberto: number; soma_aberta: number }>()

  const total = resumo?.total ?? 0
  const emAberto = resumo?.em_aberto ?? 0
  const somaAberta = resumo?.soma_aberta ?? 0

  if (total === 0) {
    throw new PayBillError(
      'no_lines',
      `não há nenhum lançamento na fatura de ${competence} deste cartão — confira a competência`,
    )
  }
  if (emAberto === 0) {
    throw new PayBillError(
      'already_paid',
      `a fatura de ${competence} já está paga: todas as linhas dessa competência já foram liquidadas`,
    )
  }

  // Competência que fecha em crédito (estorno maior que as compras) não é uma
  // fatura a pagar — mesma leitura do `HAVING SUM(amount_cents) < 0` de
  // commitments(), que já descarta essa competência do Comprometido.
  const amount_cents = -somaAberta
  if (amount_cents <= 0) {
    throw new PayBillError(
      'nothing_to_pay',
      `a fatura de ${competence} não tem valor a pagar (os estornos cobrem as compras em aberto)`,
    )
  }

  if (
    input.expected_amount_cents !== undefined &&
    input.expected_amount_cents !== amount_cents
  ) {
    throw new PayBillError(
      'amount_mismatch',
      `o valor informado não bate com a fatura de ${competence}, que está em ${amount_cents} centavos em aberto — recarregue a tela e confira antes de pagar`,
    )
  }

  const transfer_id = newId()
  const now = nowIsoUtc()
  const base = {
    purchase_date: paid_on,
    settled_at: paid_on,
    description: `Pagamento da fatura ${competence}`,
  }

  // ⚠️ UM batch só: liquidar N linhas e criar a transferência têm que ser
  // atômicos. Meia operação (transferência criada, linhas não liquidadas)
  // deixaria o dono pagando de novo — e o dinheiro já teria saído. O D1
  // reverte a sequência inteira quando um statement aborta (precedente
  // medido: createTransfer).
  //
  // ⚠️ A liquidação carrega `transfer_id IS NULL` de propósito: a perna de
  // ENTRADA desta transferência cai no próprio cartão, e embora ela nasça com
  // `bill_competence` NULL (createTransfer nunca preenche competência), o
  // filtro impede que qualquer perna venha a ser liquidada por engano se essa
  // regra mudar.
  const res = await db.batch<Transaction>([
    db.prepare(INSERT_TX_SE_HA_FATURA).bind(
      ...txBinds(
        newId(),
        {
          ...base,
          account_id: from_account_id,
          amount_cents: -amount_cents,
        },
        transfer_id,
        now,
      ),
      card_account_id,
      competence,
    ),
    db.prepare(INSERT_TX_SE_HA_FATURA).bind(
      ...txBinds(
        newId(),
        {
          ...base,
          account_id: card_account_id,
          amount_cents,
        },
        transfer_id,
        now,
      ),
      card_account_id,
      competence,
    ),
    db
      .prepare(
        `UPDATE transactions
            SET settled_at = ?, updated_at = ?
          WHERE account_id      = ?
            AND bill_competence = ?
            AND settled_at      IS NULL
            AND transfer_id     IS NULL
            AND parent_id       IS NULL`,
      )
      .bind(paid_on, now, card_account_id, competence),
    db
      .prepare(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE transfer_id = ? ORDER BY amount_cents`,
      )
      .bind(transfer_id),
  ])

  // ⚠️ ZERO pernas = o `WHERE EXISTS` recusou: outra chamada pagou esta fatura
  // entre a nossa leitura e o nosso batch. É a MESMA recusa da checagem lá em
  // cima, só que ganha da corrida — e ela precisa existir aqui porque o
  // `INSERT ... WHERE EXISTS` protege o DINHEIRO em silêncio: sem este guard,
  // a 2ª chamada não grava nada e mesmo assim responde SUCESSO, e a tela diria
  // ao dono que pagou de novo uma fatura em que não tocou.
  if (res[3].results.length === 0) {
    throw new PayBillError(
      'already_paid',
      `a fatura de ${competence} já foi paga`,
    )
  }

  // ORDER BY amount_cents: a perna negativa (saída da corrente) vem primeiro.
  const [out, inbound] = res[3].results
  return {
    transfer_id,
    amount_cents,
    settled_count: res[2].meta.changes,
    competence,
    out,
    inbound,
  }
}

// ---------------------------------------------------------------------------
// AS FATURAS EM ABERTO DE UM CARTÃO — a leitura que a TELA de pagar precisa.
//
// ⚠️ Existe porque o número que mais importa na tela de pagamento — QUANTAS
// linhas vão ser liquidadas — não era obtenível por nenhuma rota:
//
//   - `GET /api/transactions` não filtra por `bill_competence` (só
//     account_id/from/to/settled) E é paginada por KEYSET com limite. Contar
//     no cliente daria o tamanho da PÁGINA, não o da fatura: numa fatura de
//     40 compras a tela diria "12 lançamentos" com a confiança de um número
//     exato. O dono está prestes a mexer em N linhas de uma vez — mostrar o N
//     errado é pior que não mostrar nenhum.
//   - `GET /api/reports/commitments` devolve FAIXAS (min/max) por conta e
//     competência, misturando parcela prevista com recorrente em faixa. Não é
//     o valor pagável desta fatura, e não tem contagem de linha nenhuma.
//
// ⚠️ O `WHERE` daqui é BYTE A BYTE o de `payBill` (o `resumo` e o UPDATE de
// liquidação), e essa igualdade é o contrato inteiro desta função. Qualquer
// divergência faz a tela prometer um total/N que o servidor então recusa ou
// cumpre com outro número — exatamente a classe de defeito das "duas vozes"
// que bloqueou cartão em `pages/transferir.tsx`. Ao mexer numa, mexer na
// outra.
//
// `HAVING SUM(amount_cents) < 0` é a MESMA leitura do `nothing_to_pay` de
// `payBill` (e do `HAVING` de `commitments()`): competência que fecha em
// crédito (estorno maior que as compras) não é fatura a pagar, e a tela não
// deve oferecer um botão que o servidor vai recusar.
// ---------------------------------------------------------------------------

export type OpenBill = {
  /** Competência `YYYY-MM` — o mês em que a fatura FECHA. */
  competence: string
  /** Valor a pagar, POSITIVO (as compras são negativas no livro-caixa). */
  amount_cents: number
  /** ⚠️ Quantas linhas serão liquidadas. É o número que a tela precisa expor. */
  line_count: number
}

/**
 * Faturas EM ABERTO de um cartão, da mais antiga pra mais nova.
 *
 * Só devolve competência que `payBill` de fato aceitaria pagar: com linha em
 * aberto (nunca `already_paid`) e com saldo devedor (nunca `nothing_to_pay`).
 * Cartão sem nenhuma fatura aberta devolve `[]` — não é erro.
 */
export async function listOpenBills(
  db: D1Database,
  card_account_id: string,
): Promise<OpenBill[]> {
  const res = await db
    .prepare(
      `SELECT bill_competence          AS competence,
              -SUM(amount_cents)       AS amount_cents,
              COUNT(*)                 AS line_count
         FROM transactions
        WHERE account_id      = ?
          AND bill_competence IS NOT NULL
          AND settled_at      IS NULL
          AND transfer_id     IS NULL
          AND parent_id       IS NULL
        GROUP BY bill_competence
       HAVING SUM(amount_cents) < 0
        ORDER BY bill_competence`,
    )
    .bind(card_account_id)
    .all<OpenBill>()
  return res.results
}
