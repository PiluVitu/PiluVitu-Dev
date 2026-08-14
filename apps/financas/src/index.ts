import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { type AuthBindings, getAuth } from './lib/auth'
import { errJson, okJson } from './lib/envelope'
import { isRotaDeAuth, requireSession } from './lib/session'
import { accountsRoutes } from './routes/accounts'
import { categoriesRoutes } from './routes/categories'
import { debtsRoutes } from './routes/debts'
import { importRoutes } from './routes/import'
import { installmentPlansRoutes } from './routes/installments'
import { insightsRoutes } from './routes/insights'
import { payeesRoutes } from './routes/payees'
import { recurringRoutes } from './routes/recurring'
import { reportsRoutes } from './routes/reports'
import { reserveRoutes } from './routes/reserve'
import { settingsRoutes } from './routes/settings'
import { transactionsRoutes } from './routes/transactions'

// INGEST_TOKEN (fatia ⑨, Task 3): segredo dedicado pro comando que roda no
// Mac do dono, checado SÓ por POST /api/insights (routes/insights.ts#
// requireIngestToken) — nunca por sessão de navegador. Fica aqui (não em
// AuthBindings, lib/auth.ts) porque não tem nada a ver com Better Auth;
// é o próprio index.ts, dono do Bindings final do Worker, quem soma os
// dois. Via `wrangler secret put INGEST_TOKEN` em produção, `.dev.vars`
// localmente — mesmo padrão de BETTER_AUTH_SECRET/GOOGLE_CLIENT_SECRET.
export type Bindings = AuthBindings & { INGEST_TOKEN: string }

const app = new Hono<{ Bindings: Bindings }>()

/**
 * QUATRO exceções à guarda de sessão, todas EXPLÍCITAS:
 *  - /api/health: sondado por monitor externo, que não tem cookie.
 *  - /api/auth/*: é o próprio fluxo de login. Barrar aqui é deadlock —
 *    ninguém consegue autenticar porque não está autenticado.
 *  - POST /api/insights: autenticado por INGEST_TOKEN, não por sessão
 *    (fatia ⑨, Task 3) — o comando que roda no Mac do dono não tem
 *    cookie de navegador.
 *  - GET /api/insights/numbers: MESMO INGEST_TOKEN, extensão de escopo da
 *    Task 4 — o comando do Mac também precisa LER os números antes de
 *    escrever a leitura em cima deles, e não tem sessão pra isso.
 *  Nos dois casos de /api/insights, a exceção aqui só pula o
 *  requireSession() PARA AQUELE MÉTODO+PATH; quem de fato barra ou libera
 *  é a guarda presa à própria rota em routes/insights.ts
 *  (requireIngestToken para o POST; requireIngestTokenOrSession para o
 *  GET, que cai de volta pro caminho de sessão quando não há header
 *  Authorization nenhum) — sem essa guarda na rota, pular requireSession()
 *  aqui abriria a rota pra qualquer requisição sem exigir nada.
 *  ⚠️ GET /api/insights/latest NÃO está em nenhuma exceção — continua
 *  exigindo só sessão, igual toda outra leitura do app (ver
 *  src/index.test.ts, "fronteira do INGEST_TOKEN", pras provas de que o
 *  token não abre /api/accounts, não abre POST /api/payees, e não abre
 *  /api/insights/latest também).
 */
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()
  if (isRotaDeAuth(c.req.path)) return next()
  if (c.req.method === 'POST' && c.req.path === '/api/insights') return next()
  if (c.req.method === 'GET' && c.req.path === '/api/insights/numbers') {
    return next()
  }
  return requireSession<Bindings>()(c, next)
})

app.get('/api/health', () => okJson({ status: 'up' }))

// Só GET e POST: são os únicos métodos que o Better Auth usa. Precisa vir
// ACIMA do catch-all — a regra do marcador vale igual aqui.
app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))

app.route('/api', accountsRoutes)
app.route('/api', transactionsRoutes)
app.route('/api', importRoutes)
app.route('/api', settingsRoutes)
app.route('/api/installment-plans', installmentPlansRoutes)
app.route('/api/debts', debtsRoutes)
app.route('/api/reports', reportsRoutes)
app.route('/api/payees', payeesRoutes)
app.route('/api/categories', categoriesRoutes)
app.route('/api/recurring', recurringRoutes)
app.route('/api', reserveRoutes)
app.route('/api', insightsRoutes)

/**
 * Rede de segurança GLOBAL — pega qualquer exceção que uma rota deixe
 * escapar sem `try/catch` próprio. SEM isto, o handler default do Hono
 * responde `text/plain "Internal Server Error"`, FORA do envelope
 * {ok,data,notifications} que toda outra resposta desta API usa: `api<T>()`
 * (web/src/api.ts) não acha o envelope e a tela renderiza, dentro de um
 * `role="alert"`, a string literal "resposta sem envelope (HTTP 500)" — que
 * não diz nada ao dono. O achado C2 do fix final (tabela `settings` ausente
 * 500ando três telas) tratou UM caso pontual, dentro do domínio; este
 * handler fecha o buraco genérico, pra qualquer rota.
 *
 * ⚠️ NUNCA incluir `err.message`/`String(err)` na resposta — é exatamente
 * por onde um `D1_ERROR`/`SQLITE_*` cru vazaria pro cliente (mesma
 * disciplina de `friendlyConstraintMessage`/`logConstraintError`,
 * lib/errors.ts, que toda rota já segue). A mensagem do corpo é sempre o
 * texto fixo abaixo; o erro REAL só vai pro `console.error`, visível no
 * `wrangler tail`.
 *
 * `code: 'internal_error'` é o MESMO código que `apps/ramielle` usa pro
 * mesmo cenário (envelope compartilhado, tipado por `apps/web`) — não um
 * código novo desta fatia.
 *
 * Registrado ANTES do catch-all só por leitura: `app.onError` não é rota
 * (é um handler único do app, funciona igual em qualquer posição), mas
 * deixá-lo fisicamente abaixo do "SEMPRE POR ÚLTIMO" convidaria a leitura
 * errada de que a ordem importa pra ele também.
 *
 * Exportado para teste: `index.test.ts` o monta num Hono descartável pra
 * exercitar o ramo de `HTTPException` através de um caminho de erro real do
 * framework (nenhuma rota deste Worker lança uma — medido: zero ocorrências
 * em `src/`).
 */
export function onErrorGlobal(err: Error): Response {
  // HTTPException carrega um status DELIBERADO (404/401/...) escolhido por
  // quem lançou — transformá-lo em 500 esconderia a causa. Se veio com
  // Response própria, ela vale (foi escolha explícita do lançador); sem
  // ela, o status é preservado e o corpo entra no envelope, porque sair
  // dele reproduziria o mesmo "resposta sem envelope" que este handler
  // existe pra eliminar, só com outro número.
  if (err instanceof HTTPException) {
    console.error('HTTPException chegou ao onError global', err.status, err)
    if (err.res) return err.res
    return errJson(err.status, 'http_error', 'requisição não pôde ser atendida')
  }

  console.error('exceção não tratada chegou ao onError global', err)
  return errJson(500, 'internal_error', 'erro interno — tente novamente')
}

app.onError(onErrorGlobal)

// Catch-all do /api: 404 também sai no envelope. Fora de /api quem responde é
// o Static Assets (SPA), que roda antes do Worker.
// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route('/api', ...) registrado DEPOIS desta linha fica inalcançável.
app.all('/api/*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
