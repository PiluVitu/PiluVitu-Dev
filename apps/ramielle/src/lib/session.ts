/**
 * Os dois guards de sessão do ramielle — espelham `apps/financas/src/lib/
 * session.ts` (mesmo `try/catch` em torno de `getSession`, mesmo uso de
 * `getAuth` memoizado, nunca `createAuth` direto), com duas diferenças que a
 * votação exige:
 *
 *  1. Aqui existe uma SEGUNDA camada de identidade: além da sessão do Better
 *     Auth, cada request autenticado precisa de uma linha em `users`
 *     (domínio da votação) — é isso que `requireAuth`/`requireAdmin` fazem
 *     via `upsertVotacaoUser` (`domain/users.ts`) a cada chamada, não só no
 *     login.
 *  2. O finanças tem allowlist de e-mail (`email_not_allowed`); aqui a
 *     votação é LIVRE — qualquer sessão válida passa em `requireAuth`. Só
 *     `requireAdmin` discrimina, e por PRIVILÉGIO (`admin_only`), nunca por
 *     "este e-mail pode usar o app".
 *
 * ⚠️ `is_admin` é recalculado a cada chamada via `isAdminEmail(email,
 * ADMIN_EMAILS)` — nunca lido do banco como verdade (ver `domain/users.ts`).
 * Trocar `ADMIN_EMAILS` muda o resultado do PRÓXIMO request, sem exigir novo
 * login: a mesma sessão que dava 403 em `requireAdmin` passa a dar 200 assim
 * que `ADMIN_EMAILS` passa a incluir aquele e-mail (e vice-versa).
 */
import type { Context, MiddlewareHandler } from 'hono'
import { getAuth, isAdminEmail, type Auth, type AuthBindings } from './auth'
import { errJson } from './envelope'
import { upsertVotacaoUser, type VotacaoUser } from '../domain/users'

export type SessionVariables = {
  votacaoUser: VotacaoUser
}

type SessionEnv<TBindings extends AuthBindings> = {
  Bindings: TBindings
  Variables: SessionVariables
}

type SessionResolution =
  | { ok: true; votacaoUser: VotacaoUser }
  | { ok: false; response: Response }

/**
 * Isolado de `requireAuth`/`requireAdmin` de propósito: é o que evita
 * duplicar o `try/catch` de `getSession` e o upsert nos dois guards — cada
 * um só decide o que fazer com o resultado (deixar passar, ou também exigir
 * `isAdmin`).
 */
async function resolveSession<TBindings extends AuthBindings>(
  c: Context<SessionEnv<TBindings>>,
): Promise<SessionResolution> {
  let sessao: Awaited<ReturnType<Auth['api']['getSession']>>
  try {
    sessao = await getAuth(c.env).api.getSession({
      headers: c.req.raw.headers,
    })
  } catch (err) {
    // getSession vai ao D1. Sem este catch o erro vazaria como 500 sem
    // envelope, e o cliente do apps/web levantaria 'invalid_envelope' — um
    // sintoma sem relação nenhuma com a causa real.
    console.error('getSession falhou', err)
    return {
      ok: false,
      response: errJson(
        503,
        'auth_unavailable',
        'não foi possível validar a sessão agora',
      ),
    }
  }

  if (!sessao?.user) {
    return {
      ok: false,
      response: errJson(
        401,
        'not_authenticated',
        'requisição sem sessão válida',
      ),
    }
  }

  const votacaoUser = await upsertVotacaoUser(c.env.DB, {
    googleSub: sessao.user.id,
    email: sessao.user.email,
    name: sessao.user.name,
    picture: sessao.user.image ?? null,
    isAdmin: isAdminEmail(sessao.user.email, c.env.ADMIN_EMAILS),
  })

  return { ok: true, votacaoUser }
}

/**
 * Votação LIVRE: qualquer sessão válida passa. Anexa o `VotacaoUser`
 * correspondente ao contexto (`c.get('votacaoUser')` nas rotas downstream).
 */
export function requireAuth<
  TBindings extends AuthBindings,
>(): MiddlewareHandler<SessionEnv<TBindings>> {
  return async (c, next) => {
    const resolucao = await resolveSession<TBindings>(c)
    if (!resolucao.ok) return resolucao.response
    c.set('votacaoUser', resolucao.votacaoUser)
    await next()
  }
}

/**
 * Tudo do `requireAuth`, mais a checagem de privilégio: não-admin ⇒ 403
 * `admin_only`. O privilégio vem do MESMO `votacaoUser.isAdmin` recalculado
 * em `resolveSession` a cada chamada — nunca uma segunda leitura.
 */
export function requireAdmin<
  TBindings extends AuthBindings,
>(): MiddlewareHandler<SessionEnv<TBindings>> {
  return async (c, next) => {
    const resolucao = await resolveSession<TBindings>(c)
    if (!resolucao.ok) return resolucao.response
    if (!resolucao.votacaoUser.isAdmin) {
      return errJson(
        403,
        'admin_only',
        'apenas administradores podem acessar este recurso',
      )
    }
    c.set('votacaoUser', resolucao.votacaoUser)
    await next()
  }
}
