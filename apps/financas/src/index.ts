import { Hono } from 'hono'
import { requireAccess } from './lib/access'
import { errJson, okJson } from './lib/envelope'
import { accountsRoutes } from './routes/accounts'
import { debtsRoutes } from './routes/debts'
import { installmentPlansRoutes } from './routes/installments'
import { reportsRoutes } from './routes/reports'
import { transactionsRoutes } from './routes/transactions'

export type Bindings = {
  DB: D1Database
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  ACCESS_ALLOWED_EMAILS: string
}

const app = new Hono<{ Bindings: Bindings }>()

/**
 * O Access protege /api/* inteiro, MENOS /api/health — o health é sondado por
 * monitor externo, que não passa pela policy e portanto não tem JWT. A exceção
 * é explícita aqui (e não implícita na ordem de registro das rotas do Hono)
 * para não virar armadilha quando as Tasks 6-10 acrescentarem rotas.
 */
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()

  return requireAccess({
    teamDomain: c.env.ACCESS_TEAM_DOMAIN,
    aud: c.env.ACCESS_AUD,
    allowedEmails: (c.env.ACCESS_ALLOWED_EMAILS ?? '').split(','),
  })(c, next)
})

app.get('/api/health', () => okJson({ status: 'up' }))

app.route('/api', accountsRoutes)
app.route('/api', transactionsRoutes)
app.route('/api/installment-plans', installmentPlansRoutes)
app.route('/api/debts', debtsRoutes)
app.route('/api/reports', reportsRoutes)

// Catch-all do /api: 404 também sai no envelope. Fora de /api quem responde é
// o Static Assets (SPA), que roda antes do Worker.
// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route('/api', ...) registrado DEPOIS desta linha fica inalcançável.
app.all('/api/*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
