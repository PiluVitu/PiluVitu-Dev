import { Hono } from 'hono'
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  inspectTransaction,
  listTransactions,
  payBill,
  PayBillError,
  settleTransaction,
  TransactionHasOwnerError,
  unsettleTransaction,
  updateTransaction,
  type NewTransaction,
  type TransactionCursor,
  type TransactionPatch,
} from '../domain/transactions'
import { isRealCalendarDate, todayInTeresina } from '../lib/dates'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

type Env = { Bindings: { DB: D1Database } }

type NewTransfer = {
  from_account_id: string
  to_account_id: string
  amount_cents: number
  date: string
  description: string
  // Opcional: sem ele, "pro-labore" fica so na string de descricao e nenhum
  // relatorio consegue responder "quanto tirei de pro-labore este ano?".
  // Declarado no tipo (e nao so repassado por acidente, ja que o handler
  // encaminha `body` inteiro) pra ser CONTRATO da rota. Quem decide onde a
  // categoria e gravada, e o que e recusado, e `createTransfer` — ver o
  // comentario dela: so a perna de SAIDA recebe, categoria arquivada e
  // recusada (RangeError => 422 invalid_transfer) e categoria inexistente cai
  // na FK (=> 422 constraint_violation), igual em POST /transactions.
  category_id?: string | null
}

// CHECK/FK do schema (amount_cents <> 0, moeda sem valor original) chegam como
// D1_ERROR. Sao erro do usuario, nao do servidor: viram 422, nunca 500.
function isConstraint(e: unknown): e is Error {
  return (
    e instanceof Error && /SQLITE_CONSTRAINT|constraint failed/i.test(e.message)
  )
}

function constraintResponse(context: string, e: Error): Response {
  logConstraintError(context, e.message)
  return errJson(
    422,
    'constraint_violation',
    friendlyConstraintMessage(e.message),
  )
}

export const transactionsRoutes = new Hono<Env>()

// ---------------------------------------------------------------------------
// EXTRATO — paginação por KEYSET.
//
// ⚠️ NUNCA `OFFSET`: no D1 "rows read" conta linha ESCANEADA, e `OFFSET n`
// escaneia e joga fora as n anteriores — a página 10 custaria 10x a página 1,
// e o preço cresceria junto com o livro-caixa, pra sempre. O cursor entra no
// WHERE e o índice salta direto pra borda (ver
// domain/transactions.ts#buildListTransactionsQuery, com o plano medido).
//
// O cursor NÃO volta num campo próprio do envelope de propósito: a rota
// responde um ARRAY (contrato de antes desta fatia, consumido hoje por
// `web/src/pages/importar.tsx`), e toda linha já traz `purchase_date`,
// `created_at` e `id` — o cliente monta o `?before=` da página seguinte com
// a ÚLTIMA linha que recebeu. Trocar o payload por `{rows, next}` quebraria
// esse consumidor sem entregar nenhuma informação que ele ainda não tenha.
// ---------------------------------------------------------------------------

const CURSOR_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/**
 * `?before=<purchase_date>|<created_at>|<id>` — as TRÊS partes, sempre.
 * O `id` não é enfeite: `(purchase_date, created_at)` NÃO é único (um plano
 * de parcelas grava N linhas com os dois iguais), e sem ele a página
 * seguinte PULA o resto do grupo em silêncio. Ver o ⚠️ em
 * `buildListTransactionsQuery`.
 */
function parseCursor(raw: string): TransactionCursor | null {
  const parts = raw.split('|')
  if (parts.length !== 3) return null
  const [purchase_date, created_at, id] = parts
  if (!isRealCalendarDate(purchase_date)) return null
  if (!CURSOR_TS_RE.test(created_at)) return null
  if (id === '') return null
  return { purchase_date, created_at, id }
}

transactionsRoutes.get('/transactions', async (c) => {
  const limitRaw = c.req.query('limit')
  const limit = limitRaw === undefined ? undefined : Number(limitRaw)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    return errJson(422, 'invalid_limit', 'limit deve ser um inteiro >= 1')
  }

  // ⚠️ 422 (e não 400 `invalid_query`, o padrão de `reports.ts`/`debts.ts`
  // para query string malformada) porque ESTA rota já respondia 422
  // `invalid_limit` desde a fatia ①, com teste travando o contrato. Entre
  // ficar coerente com o catálogo global e ficar coerente consigo mesma, a
  // rota escolhe a segunda: dois parâmetros malformados do MESMO endpoint
  // devolvendo status diferentes seria o pior dos dois mundos. `field`
  // nomeia o parâmetro ofensor nos dois casos novos.
  const settledRaw = c.req.query('settled')
  let settled: 0 | 1 | undefined
  if (settledRaw !== undefined) {
    if (settledRaw !== '0' && settledRaw !== '1') {
      return errJson(
        422,
        'invalid_settled',
        "settled aceita apenas '0' (ainda não liquidado) ou '1' (liquidado)",
        'settled',
      )
    }
    settled = settledRaw === '1' ? 1 : 0
  }

  const beforeRaw = c.req.query('before')
  let before: TransactionCursor | undefined
  if (beforeRaw !== undefined) {
    const parsed = parseCursor(beforeRaw)
    if (parsed === null) {
      return errJson(
        422,
        'invalid_cursor',
        'before precisa ser <purchase_date>|<created_at>|<id> da última linha da página anterior (ex.: 2026-07-28|2026-07-28T13:05:00Z|<uuid>)',
        'before',
      )
    }
    before = parsed
  }

  const rows = await listTransactions(c.env.DB, {
    account_id: c.req.query('account_id'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit,
    settled,
    before,
  })
  return okJson(rows)
})

transactionsRoutes.post('/transactions', async (c) => {
  let body: NewTransaction
  try {
    body = await c.req.json<NewTransaction>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  try {
    return okJson(await createTransaction(c.env.DB, body), 201)
  } catch (e) {
    if (e instanceof RangeError) return errJson(422, 'invalid_entry', e.message)
    if (isConstraint(e)) return constraintResponse('POST /transactions', e)
    throw e
  }
})

// ---------------------------------------------------------------------------
// PATCH — corrigir uma linha.
//
// Duas recusas diferentes saem com o MESMO código (`protected_field`) e o
// campo ofensor em `field`, porque pro cliente as duas significam a mesma
// coisa ("este campo não se edita por aqui"), só mudam de motivo:
//   1. campo que NUNCA é patchável (derivado, ou com rota própria) —
//      `settled_at`, `bill_competence`, `transfer_id`, ...;
//   2. campo estrutural (valor/data/conta) numa linha que TEM DONO (parcela,
//      pagamento de dívida, rateio, transferência) — a mensagem vem crua do
//      domínio, que é quem sabe nomear a porta certa.
//
// ⚠️ Campo protegido é RECUSA, nunca "ignora e segue". Aceitar
// `{description, settled_at}` gravando só a descrição responderia 200 pra
// uma requisição que fez metade do pedido — a falha silenciosa que este
// módulo caça em toda fatia. A checagem roda ANTES de qualquer escrita.
// ---------------------------------------------------------------------------

const PROTECTED_FIELDS: Record<string, string> = {
  settled_at:
    'settled_at não é editável por aqui: liquidar tem rota própria (POST /api/transactions/:id/settle e /unsettle), porque "já saiu da conta" é outra pergunta.',
  bill_competence:
    'bill_competence é DERIVADA da data da compra e do fechamento da conta — ela é recalculada sozinha quando você muda purchase_date ou account_id. Um segundo caminho de escrita poderia contradizer a conta.',
  transfer_id:
    'transfer_id não é editável: ele é o que amarra as duas pernas de uma transferência. Apague a transferência e registre de novo.',
  parent_id:
    'parent_id não é editável: ele é o que amarra uma parte de rateio ao lançamento pai.',
  imported_id:
    'imported_id não é editável: é a chave de deduplicação do import (por conta), e mexer nela reimportaria a mesma linha.',
  import_source: 'import_source não é editável: registra de onde a linha veio.',
  currency:
    'currency não é editável: moeda diferente de BRL exige valor original e taxa, que esta rota não recebe.',
  amount_original_cents:
    'amount_original_cents não é editável por aqui (par de currency/fx_rate_ppm).',
  fx_rate_ppm: 'fx_rate_ppm não é editável por aqui (par de currency).',
  id: 'id não é editável.',
  created_at: 'created_at não é editável.',
  updated_at: 'updated_at é escrito pelo servidor a cada alteração.',
}

const STRUCTURAL_PATCH_FIELDS = [
  'amount_cents',
  'purchase_date',
  'account_id',
] as const

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

transactionsRoutes.patch('/transactions/:id', async (c) => {
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return errJson(400, 'invalid_json', 'corpo precisa ser um objeto JSON')
  }

  for (const campo of Object.keys(body)) {
    const recusa = PROTECTED_FIELDS[campo]
    if (recusa) return errJson(422, 'protected_field', recusa, campo)
  }

  const patch: TransactionPatch = {}

  if ('description' in body) {
    if (typeof body.description !== 'string' || body.description.trim() === '')
      return errJson(
        422,
        'constraint_violation',
        'description precisa ser um texto não vazio',
        'description',
      )
    patch.description = body.description
  }
  if ('payee_id' in body) {
    if (!isNullableString(body.payee_id))
      return errJson(
        422,
        'constraint_violation',
        'payee_id inválido',
        'payee_id',
      )
    patch.payee_id = body.payee_id
  }
  if ('category_id' in body) {
    if (!isNullableString(body.category_id))
      return errJson(
        422,
        'constraint_violation',
        'category_id inválido',
        'category_id',
      )
    patch.category_id = body.category_id
  }
  if ('recurring_expense_id' in body) {
    if (!isNullableString(body.recurring_expense_id))
      return errJson(
        422,
        'constraint_violation',
        'recurring_expense_id inválido',
        'recurring_expense_id',
      )
    patch.recurring_expense_id = body.recurring_expense_id
  }
  if ('is_business' in body) {
    // Aceita 0|1 E booleano, normalizando — mesma lição já paga em
    // routes/installments.ts: a SPA manda `isBusiness ? 1 : 0`, e uma
    // comparação `=== true` fez TODO plano de parcelas gravar 0 em silêncio.
    // Recusar o outro tipo seria mais "puro" e voltaria a quebrar a mesma
    // coluna, que é a que sustenta a separação PJ/PF inteira.
    const v = body.is_business
    if (v !== 0 && v !== 1 && v !== true && v !== false)
      return errJson(
        422,
        'constraint_violation',
        'is_business precisa ser 0 ou 1',
        'is_business',
      )
    patch.is_business = v === 1 || v === true ? 1 : 0
  }
  if ('amount_cents' in body) {
    // Valor 0 NÃO é checado aqui de propósito — quem barra é o
    // `CHECK (amount_cents <> 0)` do schema, mesma convenção do POST
    // (a regra mora num lugar só, e a rota cozinha a mensagem do D1).
    if (!Number.isInteger(body.amount_cents))
      return errJson(
        422,
        'constraint_violation',
        'amount_cents precisa ser um inteiro em centavos',
        'amount_cents',
      )
    patch.amount_cents = body.amount_cents as number
  }
  if ('purchase_date' in body) {
    // Calendário real, não só formato: `billCompetence` (chamada logo em
    // seguida pelo domínio, pra re-derivar a fatura) só valida o formato via
    // regex e aceitaria '2026-02-30' — a linha ficaria com uma data que não
    // existe e numa competência calculada em cima dela.
    if (
      typeof body.purchase_date !== 'string' ||
      !isRealCalendarDate(body.purchase_date)
    )
      return errJson(
        422,
        'constraint_violation',
        'purchase_date precisa ser uma data real no formato YYYY-MM-DD',
        'purchase_date',
      )
    patch.purchase_date = body.purchase_date
  }
  if ('account_id' in body) {
    if (typeof body.account_id !== 'string' || body.account_id === '')
      return errJson(
        422,
        'constraint_violation',
        'account_id inválido',
        'account_id',
      )
    patch.account_id = body.account_id
  }

  try {
    const updated = await updateTransaction(c.env.DB, id, patch)
    if (!updated)
      return errJson(404, 'not_found', `lançamento ${id} não encontrado`)
    return okJson(updated)
  } catch (e) {
    if (e instanceof TransactionHasOwnerError) {
      // `field` = o campo estrutural que o corpo tentou mexer; a mensagem
      // (que nomeia a porta certa: cancelar o plano, apagar o pagamento…)
      // vem CRUA do domínio, nunca reescrita aqui.
      const ofensor = STRUCTURAL_PATCH_FIELDS.find((f) => f in patch)
      return errJson(422, 'protected_field', e.message, ofensor)
    }
    if (e instanceof RangeError) return errJson(422, 'invalid_entry', e.message)
    if (isConstraint(e)) return constraintResponse('PATCH /transactions/:id', e)
    throw e
  }
})

// ---------------------------------------------------------------------------
// LIQUIDAR / DESLIQUIDAR — transição de ESTADO, rota própria (ver o ⚠️ de
// PROTECTED_FIELDS acima).
// ---------------------------------------------------------------------------

transactionsRoutes.post('/transactions/:id/settle', async (c) => {
  const id = c.req.param('id')

  // Corpo AUSENTE é o caso normal ("paguei hoje"), não erro — só corpo
  // presente e quebrado vira 400. `c.req.json()` lança nos dois casos, então
  // a distinção precisa do texto cru.
  const raw = (await c.req.text()).trim()
  let body: Record<string, unknown> = {}
  if (raw !== '') {
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return errJson(
        400,
        'invalid_json',
        'corpo da requisicao nao e JSON valido',
      )
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return errJson(400, 'invalid_json', 'corpo precisa ser um objeto JSON')
    }
  }

  if (body.settled_at !== undefined && typeof body.settled_at !== 'string') {
    return errJson(
      422,
      'constraint_violation',
      'settled_at precisa ser uma data YYYY-MM-DD',
      'settled_at',
    )
  }

  // ⚠️ Default é `todayInTeresina()`, NUNCA `new Date().toISOString()`: às 22h
  // de Teresina o UTC já virou o dia seguinte, e a data escolhida sairia um
  // dia à frente — o mesmo bug de fuso que este módulo já pagou três vezes.
  const settled_at =
    (body.settled_at as string | undefined) ?? todayInTeresina()

  try {
    const ok = await settleTransaction(c.env.DB, id, settled_at)
    // false = id inexistente OU já liquidado — os dois casam zero vezes com
    // o WHERE e não dá pra distingui-los sem uma segunda query. Mesma
    // ambiguidade (assumida) de archiveAccount/writeOffDebt.
    if (!ok)
      return errJson(
        404,
        'not_found',
        `lançamento ${id} não encontrado ou já liquidado`,
      )
    return okJson({ id, settled: true, settled_at })
  } catch (e) {
    if (e instanceof RangeError)
      return errJson(422, 'constraint_violation', e.message, 'settled_at')
    throw e
  }
})

transactionsRoutes.post('/transactions/:id/unsettle', async (c) => {
  const id = c.req.param('id')
  const ok = await unsettleTransaction(c.env.DB, id)
  if (!ok)
    return errJson(
      404,
      'not_found',
      `lançamento ${id} não encontrado ou já estava previsto`,
    )
  return okJson({ id, unsettled: true })
})

// ---------------------------------------------------------------------------
// DELETE — a política por classe mora no domínio (deleteTransaction); a rota
// só traduz.
//
// ⚠️ UM código só (`transaction_has_owner`) para as quatro recusas, com a
// CLASSE em `field` e a mensagem específica vinda do domínio. Cinco códigos
// obrigariam o cliente a conhecer um catálogo que muda a cada tipo novo de
// vínculo; um código + discriminador deixa a tela rotear ("cancelar o plano"
// x "apagar o pagamento") sem catálogo novo. `field` aqui carrega a CLASSE,
// não um campo de formulário — alargamento deliberado, porque é exatamente o
// slot que o envelope tem pra discriminar um erro.
// ---------------------------------------------------------------------------

transactionsRoutes.delete('/transactions/:id', async (c) => {
  const id = c.req.param('id')

  const dono = await inspectTransaction(c.env.DB, id)
  if (!dono) return errJson(404, 'not_found', `lançamento ${id} não encontrado`)

  // Os ids das DUAS pernas precisam ser lidos ANTES do DELETE — depois dele
  // não há mais o que consultar. Só no caso da transferência (o único em que
  // o domínio cascateia), e usando idx_tx_transfer: 2 linhas.
  let deleted_ids: string[] = []
  if (dono.class === 'transfer_leg' && dono.transfer_id !== null) {
    const res = await c.env.DB.prepare(
      'SELECT id FROM transactions WHERE transfer_id = ? ORDER BY amount_cents',
    )
      .bind(dono.transfer_id)
      .all<{ id: string }>()
    deleted_ids = res.results.map((r) => r.id)
  }

  try {
    const apagado = await deleteTransaction(c.env.DB, id)
    if (!apagado)
      return errJson(404, 'not_found', `lançamento ${id} não encontrado`)
    // ORDER BY amount_cents: saída (negativa) primeiro, mesma convenção que
    // createTransfer já usa pra devolver `out`/`inbound`.
    return dono.class === 'transfer_leg'
      ? okJson({ transfer_id: dono.transfer_id, deleted_ids })
      : okJson({ id, deleted: true })
  } catch (e) {
    if (e instanceof TransactionHasOwnerError)
      return errJson(422, 'transaction_has_owner', e.message, e.code)
    if (isConstraint(e))
      return constraintResponse('DELETE /transactions/:id', e)
    throw e
  }
})

transactionsRoutes.post('/transfers', async (c) => {
  let body: NewTransfer
  try {
    body = await c.req.json<NewTransfer>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  try {
    return okJson(await createTransfer(c.env.DB, body), 201)
  } catch (e) {
    if (e instanceof RangeError)
      return errJson(422, 'invalid_transfer', e.message)
    if (isConstraint(e)) return constraintResponse('POST /transfers', e)
    throw e
  }
})

// ---------------------------------------------------------------------------
// PAGAR A FATURA DO CARTÃO — POST /api/bills/pay
//
// Fica neste router (montado em `app.route('/api', ...)`, acima do catch-all)
// pelo mesmo motivo de `/transfers`: a operação é sobre o livro-caixa, e o que
// ela cria são duas linhas de `transactions` mais a liquidação de N outras.
//
// Atrás da sessão por AUSÊNCIA deliberada: `src/index.ts` aplica
// `requireSession()` a `/api/*` e só abre exceção para `/api/health`,
// `/api/auth/*`, `POST /api/insights` e `GET /api/insights/numbers`. Esta rota
// não entra em nenhuma — quem paga a fatura é o dono, no navegador.
//
// Contrato de erro, nas convenções do módulo:
//   400 `invalid_json`          corpo malformado ou campo obrigatório ausente
//   422 `invalid_account`       conta que não é cartão / origem == cartão
//                               (mesmo código que payDebt já usa pro par
//                               conta-errada-pra-esta-operação)
//   422 `invalid_bill`          recusa sobre a FATURA, com o motivo exato em
//                               `field` (`no_lines` | `already_paid` |
//                               `nothing_to_pay` | `amount_mismatch`)
//   422 `constraint_violation`  competência/data inválida (RangeError) e
//                               CHECK/FK do D1, sempre com mensagem cozida
//
// ⚠️ UM código (`invalid_bill`) com o motivo em `field`, nunca quatro códigos
// novos — precedente direto de `transaction_has_owner` (DELETE de lançamento),
// que usa um código só e põe a CLASSE em `field`. Quatro códigos obrigariam o
// cliente a conhecer um catálogo que cresce a cada motivo novo; um código mais
// discriminador deixa a tela rotear ("recarregue e confira" × "já paga") sem
// catálogo novo.
//
// ⚠️ 422 e não 409 para `already_paid`, apesar de repetir nunca resolver: a
// convenção dominante do módulo para recusa de REGRA DE NEGÓCIO é 422
// (`over_allocation`, `debt_has_ledger`, `transaction_has_owner` — todas
// "repetir não adianta"). O 409 aqui divergiria delas sem ganho.
// ---------------------------------------------------------------------------

type PayBillBody = {
  card_account_id?: unknown
  competence?: unknown
  paid_on?: unknown
  from_account_id?: unknown
  expected_amount_cents?: unknown
}

transactionsRoutes.post('/bills/pay', async (c) => {
  let body: PayBillBody
  try {
    body = await c.req.json<PayBillBody>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  const { card_account_id, competence, from_account_id } = body
  if (typeof card_account_id !== 'string' || card_account_id === '')
    return errJson(400, 'invalid_json', 'card_account_id e obrigatorio')
  if (typeof competence !== 'string' || competence === '')
    return errJson(400, 'invalid_json', 'competence e obrigatoria')
  if (typeof from_account_id !== 'string' || from_account_id === '')
    return errJson(400, 'invalid_json', 'from_account_id e obrigatorio')

  // Corpo sem `paid_on` é o caso NORMAL ("paguei hoje"), não erro — mesma
  // regra de POST /:id/settle. ⚠️ `todayInTeresina()`, NUNCA
  // `new Date().toISOString()`: às 22h de Teresina o UTC já virou o dia
  // seguinte, e o pagamento cairia no mês errado do fluxo de caixa.
  const paid_on =
    body.paid_on === undefined || body.paid_on === null
      ? todayInTeresina()
      : body.paid_on
  if (typeof paid_on !== 'string')
    return errJson(400, 'invalid_json', 'paid_on deve ser uma data YYYY-MM-DD')

  let expected_amount_cents: number | undefined
  if (
    body.expected_amount_cents !== undefined &&
    body.expected_amount_cents !== null
  ) {
    if (
      typeof body.expected_amount_cents !== 'number' ||
      !Number.isInteger(body.expected_amount_cents)
    ) {
      return errJson(
        400,
        'invalid_json',
        'expected_amount_cents deve ser um inteiro em centavos',
      )
    }
    expected_amount_cents = body.expected_amount_cents
  }

  try {
    const res = await payBill(c.env.DB, {
      card_account_id,
      competence,
      paid_on,
      from_account_id,
      expected_amount_cents,
    })
    return okJson(res, 201)
  } catch (e) {
    if (e instanceof PayBillError) {
      // A mensagem vem CRUA do domínio — é ela que nomeia a porta certa
      // ("recarregue a tela e confira", "escolha outra conta"). Recusa que só
      // diz "não" deixa o dono travado.
      if (e.code === 'invalid_account')
        return errJson(422, 'invalid_account', e.message)
      return errJson(422, 'invalid_bill', e.message, e.code)
    }
    if (e instanceof RangeError)
      return errJson(422, 'constraint_violation', e.message)
    if (isConstraint(e)) return constraintResponse('POST /bills/pay', e)
    throw e
  }
})
