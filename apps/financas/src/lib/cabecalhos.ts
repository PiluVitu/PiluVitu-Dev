import type { MiddlewareHandler } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

/** Cabeçalhos de segurança da API. Os da SPA estão em web/public/_headers. */

export const PAGINA_DE_ERRO_DO_AUTH = '/api/auth/error'

const CSP_DA_API = {
  defaultSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
}

const daApi = secureHeaders({
  contentSecurityPolicy: CSP_DA_API,
  xFrameOptions: 'DENY',
})

// Único HTML que o Worker devolve: a página de erro do Better Auth, com <style>
// e style="" inline e nenhum script.
const daPaginaDeErro = secureHeaders({
  contentSecurityPolicy: { ...CSP_DA_API, styleSrc: ["'unsafe-inline'"] },
  xFrameOptions: 'DENY',
})

export const cabecalhosDeSeguranca: MiddlewareHandler = (c, next) =>
  c.req.path === PAGINA_DE_ERRO_DO_AUTH
    ? daPaginaDeErro(c, next)
    : daApi(c, next)
