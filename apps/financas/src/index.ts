import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { type AuthBindings, getAuth } from './lib/auth'
import { errJson, okJson } from './lib/envelope'
import type { IaBindings } from './lib/ia'
import type { PluggyBindings } from './lib/pluggy'
import { isRotaDeAuth, requireSession } from './lib/session'
import { accountsRoutes } from './routes/accounts'
import { categoriesRoutes } from './routes/categories'
import { debtsRoutes } from './routes/debts'
import { importRoutes } from './routes/import'
import { installmentPlansRoutes } from './routes/installments'
import { insightsRoutes } from './routes/insights'
import { payeesRoutes } from './routes/payees'
import { pluggyRoutes } from './routes/pluggy'
import { recurringRoutes } from './routes/recurring'
import { reportsRoutes } from './routes/reports'
import { reserveRoutes } from './routes/reserve'
import { rulesRoutes } from './routes/rules'
import { settingsRoutes } from './routes/settings'
import { transactionsRoutes } from './routes/transactions'
import { transfersRoutes } from './routes/transfers'
import { scheduled } from './scheduled'

// PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET (fatia ④): credenciais do app no
// Meu Pluggy, lidas SÓ por routes/pluggy.ts (via lib/pluggy.ts). Também
// secrets, e por um motivo medido: scripts/backup-d1.sh exporta o D1
// INTEIRO às 03:00 e guarda 30 cópias em texto claro — guardá-las em
// `settings` publicaria a credencial em 30 arquivos que rotacionar a chave
// depois não apagaria. `itemId`/`accountId` NÃO são credencial e vão em
// `settings` normalmente.
export type Bindings = AuthBindings & PluggyBindings & IaBindings

export const app = new Hono<{ Bindings: Bindings }>()

/**
 * Duas exceções à guarda de sessão, ambas explícitas:
 *  - /api/health: sondado por monitor externo, que não tem cookie.
 *  - /api/auth/*: é o próprio fluxo de login; barrar aqui é deadlock.
 * Toda outra rota, insights inclusos, exige a sessão do dono (ver
 * src/index.test.ts, "fronteira do INGEST_TOKEN").
 */
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()
  if (isRotaDeAuth(c.req.path)) return next()
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
app.route('/api', transfersRoutes)
app.route('/api/installment-plans', installmentPlansRoutes)
app.route('/api/debts', debtsRoutes)
app.route('/api/reports', reportsRoutes)
app.route('/api/payees', payeesRoutes)
app.route('/api/categories', categoriesRoutes)
app.route('/api/recurring', recurringRoutes)
app.route('/api/rules', rulesRoutes)
app.route('/api/pluggy', pluggyRoutes)
app.route('/api', reserveRoutes)
app.route('/api', insightsRoutes)

/**
 * Rede de segurança GLOBAL — pega qualquer exceção que uma rota deixe
 * escapar sem `try/catch` próprio, DESDE QUE seja um `Error`. SEM isto,
 * o handler default do Hono
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
 * ⚠️ NÃO é "nenhuma exceção sai fora do envelope" — o Hono só chama este
 * handler quando o que foi lançado é um `Error`: `if (err instanceof Error
 * && onError)` (`hono/dist/compose.js`). Um `throw 'string'` ou um objeto
 * cru continua saindo como `text/plain`, fora do envelope. Nenhum código
 * deste Worker lança valor não-`Error` hoje, então é inofensivo na prática
 * — mas a frase absoluta convidaria a confiar demais numa rede que tem
 * esse furo.
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
  //
  // ⚠️ Um `HTTPException(401)` sai daqui como `401 http_error`, e isso TEM
  // consequência concreta — não é só uma etiqueta genérica. A SPA só
  // re-gateia a sessão quando `res.status === 401 && code ===
  // 'not_authenticated'` (web/src/api.ts, o `$store.notify('$sessionSignal')`
  // que devolve o dono pro login); com qualquer outro código o 401 vira erro
  // cru na tela, com o header logado de pé, sem caminho de volta. Ou seja:
  // 401 → `not_authenticated` NÃO seria "chute semântico", é o contrato que
  // a SPA já exige.
  //
  // DECISÃO: só documentar, não mapear. Mapear agora criaria comportamento
  // sem nenhum chamador real — MEDIDO: zero `HTTPException` em `src/`, então
  // o ramo só existe pra middleware do Hono/dependência futura. Um mapa
  // 401→`not_authenticated` escrito hoje nasceria sem teste que o exercite
  // por um caminho de produção, e poderia estar errado quando o primeiro
  // lançador real aparecer (uma lib pode lançar 401 por motivo que NÃO é
  // "sua sessão acabou" — mandar o dono pro login seria a resposta errada).
  // Quem introduzir a primeira `HTTPException` aqui deve preferir `errJson`
  // (o envelope é o contrato do módulo); se ela for de sessão, mapear o 401
  // para `not_authenticated` JUNTO com o caso de uso que a justifique.
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

export default { fetch: app.fetch, scheduled }
