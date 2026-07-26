import { Hono } from 'hono'
import { errJson, okJson } from '../lib/envelope'

// Local, não importado de '../index' — mesma convenção das demais rotas
// (accounts.ts, transactions.ts, installments.ts, debts.ts, reports.ts,
// payees.ts): evita ciclo de import valor↔tipo com src/index.ts.
type Env = { Bindings: { DB: D1Database } }

export type Category = {
  id: string
  parent_id: string | null
  name: string
  kind: 'income' | 'expense' | 'transfer' | 'debt_settlement'
  slug: string | null
  default_scope: 'PJ' | 'PF' | null
  created_at: string
}

const KINDS = ['income', 'expense', 'transfer', 'debt_settlement']

const COLUNAS = 'id, parent_id, name, kind, slug, default_scope, created_at'

export const categoriesRoutes = new Hono<Env>()

categoriesRoutes.get('/', async (c) => {
  const kind = c.req.query('kind')
  if (kind !== undefined && !KINDS.includes(kind)) {
    return errJson(
      400,
      'invalid_query',
      'kind precisa ser income, expense, transfer ou debt_settlement',
    )
  }

  const stmt = kind
    ? c.env.DB.prepare(
        `SELECT ${COLUNAS} FROM categories WHERE archived_at IS NULL AND kind = ? ORDER BY name`,
      ).bind(kind)
    : c.env.DB.prepare(
        `SELECT ${COLUNAS} FROM categories WHERE archived_at IS NULL ORDER BY name`,
      )

  const { results } = await stmt.all<Category>()
  return okJson(results)
})
