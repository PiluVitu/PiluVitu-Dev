// apps/financas/src/lib/session.ts
/**
 * Camada 2 da allowlist: barra o USO de uma sessão já existente cujo
 * e-mail não está em ALLOWED_EMAIL. Independente do hook de criação
 * (auth.ts#assertEmailPermitido) — o Better Auth não tem consciência de
 * allowlist fora do hook (medido: spike S6a, sessão de e-mail fora da
 * lista, criada por fora do hook, valida normalmente no getSession).
 */
import type { MiddlewareHandler } from 'hono'
import { getAuth, isAllowedEmail, type Auth, type AuthBindings } from './auth'
import { errJson } from './envelope'

export type Decisao =
  | { ok: true }
  | { ok: false; status: 401 | 403; code: string; message: string }

/**
 * Isolada do runtime do Better Auth e do Hono de propósito: é o que
 * permite provar "sessão existe mas o e-mail é outro" com um teste barato
 * (ver session.test.ts), sem depender de HTTP.
 */
export function decidirAcesso(
  sessao: { user?: { email?: string | null } } | null | undefined,
  permitido: string,
): Decisao {
  if (!sessao?.user) {
    return {
      ok: false,
      status: 401,
      code: 'not_authenticated',
      message: 'requisição sem sessão válida',
    }
  }
  if (!isAllowedEmail(sessao.user.email, permitido)) {
    return {
      ok: false,
      status: 403,
      code: 'email_not_allowed',
      message: 'este e-mail não tem acesso ao aplicativo',
    }
  }
  return { ok: true }
}

/** '/api/auth' também, não só '/api/auth/…' — senão o path exato cai na guarda. */
export function isRotaDeAuth(path: string): boolean {
  return path === '/api/auth' || path.startsWith('/api/auth/')
}

/**
 * Substitui requireAccess. Módulo single-user: nada downstream lê a
 * identidade, então ela NÃO vai para o contexto do Hono — o tipo continua
 * limpo nas rotas de domínio, que não mudam uma linha.
 *
 * Genérico em `TBindings extends AuthBindings` (fatia ⑨, Task 3): o
 * `Bindings` de `src/index.ts` cresceu para `AuthBindings & { INGEST_TOKEN:
 * string }` quando o segredo de ingestão entrou — e `Context<E>` do Hono é
 * INVARIANTE no seu parâmetro de env (mesma classe de problema já
 * documentada em `lib/auth.ts` sobre `Auth`/`ReturnType<typeof betterAuth>`),
 * então `MiddlewareHandler<{ Bindings: AuthBindings }>` fixo deixa de
 * aceitar um `Context<{ Bindings: AuthBindings & {...} }>` mesmo o segundo
 * sendo estruturalmente "AuthBindings e mais alguma coisa". O chamador
 * (`index.ts`) passa o `Bindings` final explícito: `requireSession<Bindings>()`.
 */
export function requireSession<
  TBindings extends AuthBindings,
>(): MiddlewareHandler<{
  Bindings: TBindings
}> {
  return async (c, next) => {
    let sessao: Awaited<ReturnType<Auth['api']['getSession']>>
    try {
      sessao = await getAuth(c.env).api.getSession({
        headers: c.req.raw.headers,
      })
    } catch (err) {
      // getSession vai ao D1. Sem este catch o erro vazaria como 500 sem
      // envelope, e api<T>() na SPA levantaria 'invalid_envelope' —
      // sintoma sem relação nenhuma com a causa.
      console.error('getSession falhou', err)
      return errJson(
        503,
        'auth_unavailable',
        'não foi possível validar a sessão agora',
      )
    }

    const d = decidirAcesso(sessao, c.env.ALLOWED_EMAIL)
    if (!d.ok) return errJson(d.status, d.code, d.message)
    await next()
  }
}
