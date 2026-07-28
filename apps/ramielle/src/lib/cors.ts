/**
 * CORS com credenciais — paridade com `apps/api/internal/router/router.go`
 * (`corsOptions`/`allowedOrigins`). O `apps/web` mora em `piluvitu.com.br`
 * (Vercel); o ramielle mora em `api.piluvitu.com.br` — origens DIFERENTES, e
 * é isso que obriga CORS explícito aqui: sem `Access-Control-Allow-Origin` +
 * `Access-Control-Allow-Credentials` corretos, o cookie de sessão do Better
 * Auth nunca atravessa um `fetch(..., { credentials: 'include' })` do
 * `apps/web`.
 *
 * ⚠️ `Access-Control-Allow-Origin: '*'` é INCOMPATÍVEL com credenciais — o
 * navegador recusa a resposta INTEIRA quando os dois aparecem juntos (é o
 * browser que recusa, não o servidor que erra). Por isso `origin` abaixo é
 * SEMPRE um array de origens explícitas — nunca a string `'*'`, que é o
 * default do `hono/cors` quando nenhuma `origin` é passada. O resolver do
 * `hono/cors` para array (`optsOrigin.includes(origin) ? origin : null`, ver
 * `node_modules/hono/dist/middleware/cors/index.js`) NUNCA devolve `'*'`:
 * devolve a origem exata que bateu, ou nada — mesmo que alguém configure
 * `CORS_ALLOWED_ORIGINS=*` por engano (vira o array literal `['*']`, que só
 * "bateria" contra um header `Origin: *`, que nenhum browser real envia).
 * `cors.test.ts` tem a asserção negativa dedicada.
 */
import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'

/**
 * Mesmo default do Go (`apps/api/internal/router/router.go`,
 * `defaultAllowedOrigins`) — `localhost:3333` cobre o dev do `apps/web`,
 * `piluvitu.com.br` é a produção dele.
 */
export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3333',
  'https://piluvitu.com.br',
]

/**
 * `CORS_ALLOWED_ORIGINS` é CSV — mesmo contrato do Go (`allowedOrigins()` em
 * `router.go`): trim por item, item vazio descartado, CSV vazio/ausente/só-
 * vírgulas cai pro default. Pura, sem tocar em `Context`/`Request` — testável
 * isoladamente.
 */
export function allowedOrigins(csv: string | undefined): string[] {
  const raw = (csv ?? '').trim()
  if (raw.length === 0) return DEFAULT_ALLOWED_ORIGINS

  const parts = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

  return parts.length > 0 ? parts : DEFAULT_ALLOWED_ORIGINS
}

/**
 * `credentials: true` é o motivo desta task existir — sem ele o cookie de
 * sessão do Better Auth nunca atravessa origem cruzada. `allowMethods`/
 * `allowHeaders` cobrem só o que este Worker expõe hoje (GET/POST via Hono,
 * OPTIONS do próprio preflight; `Content-Type`/`Authorization` — mesma
 * lista enxuta do Go, `corsOptions()`).
 *
 * Genérica em `TBindings` (mesmo padrão de `requireAuth`/`requireAdmin`,
 * `./session.ts`) — `Context` do Hono é INVARIANTE no parâmetro de `Env`,
 * então um `MiddlewareHandler<{ Bindings: { CORS_ALLOWED_ORIGINS?: string } }>`
 * fixo não seria atribuível a `MiddlewareHandler<{ Bindings: Bindings }>` do
 * `index.ts` (`Bindings` tem mais campos). Construída por REQUEST (dentro do
 * handler), nunca memoizada como `getAuth`: `cors()` só monta closures, não
 * tem custo de CPU comparável ao `betterAuth()` que justificasse cache.
 */
export function corsMiddleware<
  TBindings extends { CORS_ALLOWED_ORIGINS?: string },
>(): MiddlewareHandler<{ Bindings: TBindings }> {
  return (c, next) => {
    const middleware = cors({
      origin: allowedOrigins(c.env.CORS_ALLOWED_ORIGINS),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 300,
    })
    return middleware(c, next)
  }
}
