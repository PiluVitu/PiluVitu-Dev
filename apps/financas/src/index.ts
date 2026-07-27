import { Hono } from 'hono'
import { type AuthBindings, getAuth } from './lib/auth'
import { errJson, okJson } from './lib/envelope'
import { isRotaDeAuth, requireSession } from './lib/session'
import { accountsRoutes } from './routes/accounts'
import { categoriesRoutes } from './routes/categories'
import { debtsRoutes } from './routes/debts'
import { installmentPlansRoutes } from './routes/installments'
import { payeesRoutes } from './routes/payees'
import { reportsRoutes } from './routes/reports'
import { settingsRoutes } from './routes/settings'
import { transactionsRoutes } from './routes/transactions'

export type Bindings = AuthBindings

const app = new Hono<{ Bindings: Bindings }>()

/**
 * DUAS exceções à guarda, ambas EXPLÍCITAS:
 *  - /api/health: sondado por monitor externo, que não tem cookie.
 *  - /api/auth/*: é o próprio fluxo de login. Barrar aqui é deadlock —
 *    ninguém consegue autenticar porque não está autenticado.
 */
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()
  if (isRotaDeAuth(c.req.path)) return next()
  return requireSession()(c, next)
})

app.get('/api/health', () => okJson({ status: 'up' }))

// Só GET e POST: são os únicos métodos que o Better Auth usa. Precisa vir
// ACIMA do catch-all — a regra do marcador vale igual aqui.
app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))

app.route('/api', accountsRoutes)
app.route('/api', transactionsRoutes)
app.route('/api', settingsRoutes)
app.route('/api/installment-plans', installmentPlansRoutes)
app.route('/api/debts', debtsRoutes)
app.route('/api/reports', reportsRoutes)
app.route('/api/payees', payeesRoutes)
app.route('/api/categories', categoriesRoutes)

// Catch-all do /api: 404 também sai no envelope. Fora de /api quem responde é
// o Static Assets (SPA), que roda antes do Worker.
// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route('/api', ...) registrado DEPOIS desta linha fica inalcançável.
app.all('/api/*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
