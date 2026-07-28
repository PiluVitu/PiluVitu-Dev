import { Hono } from 'hono'
import { type AuthBindings, getAuth } from './lib/auth'
import { corsMiddleware } from './lib/cors'
import { errJson, okJson } from './lib/envelope'
import authRoutes from './routes/auth'

// `CORS_ALLOWED_ORIGINS` mora no tipo `AuthBindings` (`lib/auth.ts`), não
// mais aqui — desde I2 (revisão final) `createAuth` também lê essa binding
// pra montar `trustedOrigins`, então declará-la só uma vez em `AuthBindings`
// evita duas cópias do mesmo campo divergindo. Contrato de formato/default
// (CSV, `DEFAULT_ALLOWED_ORIGINS`) continua documentado só em `lib/cors.ts`.
export type Bindings = AuthBindings

const app = new Hono<{ Bindings: Bindings }>()

// CORS é a PRIMEIRA coisa montada, de propósito — precisa vir ACIMA de
// TUDO, inclusive do handler `/api/auth/*` do Better Auth (linha abaixo) e
// do catch-all no fim do arquivo. `app.use('*', ...)` casa com QUALQUER
// método (inclusive OPTIONS) e QUALQUER path; para um preflight `OPTIONS`,
// o middleware de `hono/cors` responde 204 diretamente, SEM chamar
// `next()` — se o catch-all (ou qualquer outra rota) estivesse registrado
// ANTES deste `use`, ele entraria na cadeia primeiro e o preflight de
// `/api/auth/*` cairia no 404 do catch-all em vez de ser respondido, e o
// login quebraria sem mensagem útil nenhuma no browser (só "CORS error"
// genérico, sem detalhe). Ver `lib/cors.ts` pro motivo do `credentials`.
app.use('*', corsMiddleware<Bindings>())

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

// `/auth/me` e `/auth/logout` — paridade de path com o Go (`apps/api`),
// distinto de `/api/auth/*` acima (Better Auth). Precisa vir ACIMA do
// catch-all, mesma regra de sempre.
app.route('/auth', authRoutes)

// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route() registrado depois desta linha fica inalcançável.
app.all('*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
