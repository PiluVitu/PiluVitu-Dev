import { Hono } from 'hono'
import {
  addDebtItem,
  createDebt,
  debtDetail,
  DebtHasLedgerError,
  deleteDebt,
  deleteDebtItem,
  deleteDebtPayment,
  InvalidPaymentError,
  listDebts,
  OverAllocationError,
  payDebt,
  writeOffDebt,
} from '../domain/debts'
import type {
  Allocation,
  DebtDirection,
  DebtPaymentKind,
  DebtStatus,
} from '../domain/debts'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

type Env = { Bindings: { DB: D1Database } }

export const debtsRoutes = new Hono<Env>()

const STATUSES: DebtStatus[] = ['open', 'settled', 'written_off']
const DIRECTIONS: DebtDirection[] = ['i_owe', 'owed_to_me']
const KINDS: DebtPaymentKind[] = ['cash', 'offset', 'forgiven']

async function parseBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

// Mensagem fixada aqui (não em err.message de DebtHasLedgerError) porque é
// esta rota que a expõe pro dono pela primeira vez — o texto tem que nomear
// a alternativa ('Dar baixa'), senão a recusa só diz "não" e ele fica preso
// sem saber o que fazer. Um teste dedicado (routes/debts.test.ts) assegura
// que 'Dar baixa' continua no texto — uma edição futura que a remova quebra
// esse teste antes de quebrar a experiência real.
const DEBT_HAS_LEDGER_MESSAGE =
  "Esta dívida já tem pagamento em dinheiro registrado no caixa. Excluir apagaria a dívida e deixaria o lançamento sem explicação. Use 'Dar baixa' para encerrá-la preservando o histórico, ou exclua os pagamentos primeiro."

function mapError(err: unknown): Response {
  if (err instanceof DebtHasLedgerError)
    return errJson(422, err.code, DEBT_HAS_LEDGER_MESSAGE)
  if (err instanceof OverAllocationError)
    return errJson(422, 'over_allocation', err.message)
  if (err instanceof InvalidPaymentError)
    return errJson(err.code === 'not_found' ? 404 : 422, err.code, err.message)
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('SQLITE_CONSTRAINT')) {
    logConstraintError('debts', message)
    return errJson(
      422,
      'constraint_violation',
      friendlyConstraintMessage(message),
    )
  }
  throw err
}

debtsRoutes.get('/', async (c) => {
  const status = c.req.query('status') ?? null
  const direction = c.req.query('direction') ?? null
  if (status !== null && !STATUSES.includes(status as DebtStatus))
    return errJson(400, 'invalid_query', 'status invalido')
  if (direction !== null && !DIRECTIONS.includes(direction as DebtDirection))
    return errJson(400, 'invalid_query', 'direction invalida')

  const debts = await listDebts(c.env.DB, {
    status: status as DebtStatus | null,
    direction: direction as DebtDirection | null,
  })
  return okJson(debts)
})

debtsRoutes.post('/', async (c) => {
  const body = await parseBody(c.req.raw)
  if (!body) return errJson(400, 'invalid_json', 'corpo nao e JSON valido')

  const { payee_id, direction, title, opened_at, notes } = body
  if (typeof payee_id !== 'string' || payee_id === '')
    return errJson(400, 'invalid_json', 'payee_id obrigatorio')
  if (
    typeof direction !== 'string' ||
    !DIRECTIONS.includes(direction as DebtDirection)
  )
    return errJson(400, 'invalid_json', 'direction invalida')
  if (typeof title !== 'string' || title === '')
    return errJson(400, 'invalid_json', 'title obrigatorio')
  if (typeof opened_at !== 'string' || opened_at === '')
    return errJson(400, 'invalid_json', 'opened_at obrigatorio')

  try {
    const debt = await createDebt(c.env.DB, {
      payee_id,
      direction: direction as DebtDirection,
      title,
      opened_at,
      notes: typeof notes === 'string' ? notes : undefined,
    })
    return okJson(debt, 201)
  } catch (err) {
    return mapError(err)
  }
})

debtsRoutes.get('/:id', async (c) => {
  const detail = await debtDetail(c.env.DB, c.req.param('id'))
  if (!detail.debt) return errJson(404, 'not_found', 'divida nao encontrada')
  return okJson(detail)
})

debtsRoutes.post('/:id/items', async (c) => {
  const body = await parseBody(c.req.raw)
  if (!body) return errJson(400, 'invalid_json', 'corpo nao e JSON valido')

  const {
    description,
    amount_cents,
    incurred_on,
    transaction_id,
    category_id,
  } = body
  if (typeof description !== 'string' || description === '')
    return errJson(400, 'invalid_json', 'description obrigatoria')
  if (!Number.isInteger(amount_cents) || (amount_cents as number) <= 0)
    return errJson(
      400,
      'invalid_json',
      'amount_cents tem que ser inteiro positivo',
    )
  if (typeof incurred_on !== 'string' || incurred_on === '')
    return errJson(400, 'invalid_json', 'incurred_on obrigatorio')

  try {
    const item = await addDebtItem(c.env.DB, {
      debt_id: c.req.param('id'),
      description,
      amount_cents: amount_cents as number,
      incurred_on,
      transaction_id:
        typeof transaction_id === 'string' ? transaction_id : null,
      category_id: typeof category_id === 'string' ? category_id : null,
    })
    return okJson(item, 201)
  } catch (err) {
    return mapError(err)
  }
})

debtsRoutes.post('/:id/payments', async (c) => {
  const body = await parseBody(c.req.raw)
  if (!body) return errJson(400, 'invalid_json', 'corpo nao e JSON valido')

  const {
    paid_on,
    amount_cents,
    allocations,
    kind,
    account_id,
    description,
    notes,
  } = body
  if (typeof paid_on !== 'string' || paid_on === '')
    return errJson(400, 'invalid_json', 'paid_on obrigatorio')
  if (!Number.isInteger(amount_cents) || (amount_cents as number) <= 0)
    return errJson(
      400,
      'invalid_json',
      'amount_cents tem que ser inteiro positivo',
    )
  if (kind !== undefined && !KINDS.includes(kind as DebtPaymentKind))
    return errJson(400, 'invalid_json', 'kind invalido')
  if (!Array.isArray(allocations) || allocations.length === 0)
    return errJson(400, 'invalid_json', 'allocations obrigatorio')
  for (const alloc of allocations as Allocation[]) {
    if (
      !alloc ||
      typeof alloc.item_id !== 'string' ||
      !Number.isInteger(alloc.amount_cents) ||
      alloc.amount_cents <= 0
    )
      return errJson(400, 'invalid_json', 'alocacao invalida')
  }

  try {
    const result = await payDebt(c.env.DB, {
      debt_id: c.req.param('id'),
      paid_on,
      amount_cents: amount_cents as number,
      allocations: allocations as Allocation[],
      kind: kind as DebtPaymentKind | undefined,
      account_id: typeof account_id === 'string' ? account_id : null,
      description: typeof description === 'string' ? description : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    })
    return okJson(result, 201)
  } catch (err) {
    return mapError(err)
  }
})

// Convencao de modulo: funcao de dominio devolve boolean (meta.changes > 0),
// a rota traduz false em 404 not_found — mesmo padrao de accounts.ts#archive.
// DebtHasLedgerError e a UNICA excecao de negocio aqui, tratada por mapError.
debtsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const deleted = await deleteDebt(c.env.DB, id)
    if (!deleted) return errJson(404, 'not_found', 'divida nao encontrada')
    return okJson({ id, deleted: true })
  } catch (err) {
    return mapError(err)
  }
})

debtsRoutes.post('/:id/write-off', async (c) => {
  const id = c.req.param('id')
  const done = await writeOffDebt(c.env.DB, id)
  if (!done)
    return errJson(
      404,
      'not_found',
      'divida nao encontrada, ja quitada ou ja baixada',
    )
  return okJson({ id, written_off: true })
})

// Item com alocacao: deleteDebtItem deixa o RESTRICT do D1 propagar cru
// (mesmo padrao de addDebtItem contra debt_id inexistente) — mapError e
// quem cura o SQLITE_CONSTRAINT antes de qualquer resposta sair daqui.
debtsRoutes.delete('/:id/items/:itemId', async (c) => {
  const id = c.req.param('id')
  const itemId = c.req.param('itemId')
  try {
    const deleted = await deleteDebtItem(c.env.DB, id, itemId)
    if (!deleted) return errJson(404, 'not_found', 'item nao encontrado')
    return okJson({ id: itemId, deleted: true })
  } catch (err) {
    return mapError(err)
  }
})

debtsRoutes.delete('/:id/payments/:paymentId', async (c) => {
  const id = c.req.param('id')
  const paymentId = c.req.param('paymentId')
  const deleted = await deleteDebtPayment(c.env.DB, id, paymentId)
  if (!deleted) return errJson(404, 'not_found', 'pagamento nao encontrado')
  return okJson({ id: paymentId, deleted: true })
})
