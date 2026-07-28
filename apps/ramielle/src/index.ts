import { Hono } from 'hono'
import { type AuthBindings, getAuth } from './lib/auth'
import { errJson, okJson } from './lib/envelope'

export type Bindings = AuthBindings

const app = new Hono<{ Bindings: Bindings }>()

// Paridade com o /health do Go (router.go): ele pinga o banco e responde
// {"ok":true,"db":"up"} | {"ok":false,"db":"down"}. Aqui o corpo entra no
// envelope do módulo — `db` vira campo de `data`, não raiz — porque no
// ramielle TODA rota responde no envelope, e o /health do Go era a única
// exceção dele. Nenhum monitor externo depende do shape antigo (medido:
// nenhum chamador em apps/web).
app.get('/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first()
    return okJson({ db: 'up' })
  } catch {
    return errJson(503, 'db_down', 'banco indisponível')
  }
})

// Só GET e POST — os únicos métodos que o Better Auth usa. Precisa vir
// ACIMA do catch-all: no Hono a ordem de registro decide. `/api/auth/*` não
// passa pelo envelope {ok,data,notifications} — as respostas são as do
// próprio Better Auth (getAuth(env).handler(...) devolvido cru), mesma
// convenção já documentada no finanças.
app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))

// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route() registrado depois desta linha fica inalcançável.
app.all('*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
