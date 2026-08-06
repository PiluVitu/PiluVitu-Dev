import { Hono } from 'hono'
import { type AuthBindings, getAuth } from './lib/auth'
import { corsMiddleware } from './lib/cors'
import { errJson, okJson } from './lib/envelope'
import authRoutes from './routes/auth'
import votacaoRoutes from './routes/votacao'

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
// ACIMA do catch-all: no Hono a ordem de registro decide. As respostas
// NORMAIS deste mount (sucesso ou erro tratado pelo próprio Better Auth)
// não passam pelo envelope {ok,data,notifications} — são as do handler do
// Better Auth devolvidas cruas (`getAuth(env).handler(...)`), mesma
// convenção já documentada no finanças. ⚠️ M6 (revisão final): isto NÃO
// vale mais pra uma exceção que ESCAPE do handler do Better Auth (ex.: erro
// de D1 que a lib não capture) — com o `app.onError` global registrado
// abaixo, essa exceção agora É capturada e sai DENTRO do envelope, igual a
// qualquer outra rota. O CLAUDE.md antes afirmava "este mount não passa
// pelo envelope" sem essa ressalva — imprecisão corrigida lá também.
app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))

// `/auth/me` e `/auth/logout` — paridade de path com o Go (`apps/api`),
// distinto de `/api/auth/*` acima (Better Auth). Precisa vir ACIMA do
// catch-all, mesma regra de sempre.
app.route('/auth', authRoutes)

// As rotas de votação (fatia ②) — precisam vir ACIMA do catch-all, mesma
// regra de sempre. As 7 rotas desta fatia estão TODAS montadas aqui (T2–T6,
// ver apps/ramielle/CLAUDE.md § "Estado da fatia ② (votação)" pro histórico
// task a task); a prova de que nenhuma caiu abaixo do catch-all é por
// EXECUÇÃO (`index.test.ts`, describe da montagem), não por leitura deste
// comentário.
app.route('/votacao', votacaoRoutes)

// Rede de segurança GLOBAL (T6) — pega qualquer exceção que uma rota deixe
// escapar sem `try/catch` próprio. SEM isto, o handler default do Hono
// responde `text/plain "Internal Server Error"`, FORA do envelope
// {ok,data,notifications} que toda outra resposta desta API usa — o
// `call<T>()` do apps/web levanta `invalid_envelope`, um sintoma sem
// relação nenhuma com a causa real. O Go, pro mesmo cenário (panic/erro não
// tratado num handler), sempre responde `internal_error` DENTRO do
// envelope (`httpx.Error`) — este handler fecha essa paridade.
//
// ⚠️ NUNCA incluir `err.message`/`String(err)` na resposta — é exatamente
// por onde um `D1_ERROR`/`SQLITE_*` cru vazaria pro cliente (mesma classe de
// cuidado já tomada em `GET /health`, `db_down`). A mensagem é sempre o
// texto fixo abaixo; o erro REAL só vai pro `console.error` (visível via
// `wrangler tail`), nunca pro corpo da resposta.
//
// ⚠️ M6 (revisão final): registrado AQUI, ANTES do catch-all — não porque a
// ORDEM de registro importe pro Hono (`app.onError` não é uma rota, é um
// handler único no app inteiro; funciona igual não importa onde é chamado,
// inclusive DEPOIS do catch-all, como estava antes). Movido só porque
// "SEMPRE POR ÚLTIMO", no comentário do catch-all logo abaixo, é sobre
// `app.route()`/rotas — deixar `onError` fisicamente depois daquele
// comentário convidava a leitura errada de que ele também precisava vir
// por último.
app.onError((err) => {
  console.error('exceção não tratada chegou ao onError global', err)
  return errJson(500, 'internal_error', 'erro interno — tente novamente')
})

// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route() registrado depois desta linha fica inalcançável.
app.all('*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
