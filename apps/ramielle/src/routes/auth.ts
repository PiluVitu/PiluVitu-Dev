/**
 * `GET /auth/me` e `POST /auth/logout` — paridade de shape com o Go
 * (`apps/api/internal/auth/handlers.go#Me`/`#Logout`, mais os campos extras
 * que `apps/api/internal/handlers/admin/users.go#ListUsers` e o tipo
 * `AdminUser` de `apps/web/lib/votacao/types.ts` expõem — ver o comentário em
 * `/me` abaixo pro porquê de `created_at` entrar aqui).
 *
 * Convenção do monorepo (mesma de `apps/financas/src/routes/*.ts`): `Env`
 * local, NUNCA importa `Bindings` de `../index` — evitaria import circular
 * valor↔tipo entre esta rota e `src/index.ts` (que monta esta rota).
 */
import { Hono } from 'hono'
import { getAuth, type AuthBindings } from '../lib/auth'
import { requireAuth, type SessionVariables } from '../lib/session'
import { okJson } from '../lib/envelope'

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

const authRoutes = new Hono<Env>()

/**
 * ⚠️ Shape: `id`, `name`, `email`, `picture`, `is_admin`, `created_at` —
 * `google_sub` NUNCA sai (o Go já o omite de propósito do shape de `User`).
 *
 * O `Handlers.Me` do Go (`internal/auth/handlers.go`) devolve só 5 campos
 * (sem `created_at`); é o `ListUsers` do admin (`internal/handlers/admin/
 * users.go`) — e o tipo `AdminUser` espelho em `apps/web/lib/votacao/
 * types.ts` — quem devolve os 6, `created_at` incluso. Esta rota usa os 6
 * campos (instrução explícita do brief desta task) — um campo A MAIS do que
 * o `Handlers.Me` do Go, nunca a menos, e inofensivo pro cliente atual: o
 * tipo `User` do `apps/web` (`call<User>('/auth/me')`) não declara
 * `created_at`, mas TypeScript não faz excess-property-check sobre um valor
 * vindo de `fetch`/`JSON.parse` — o campo extra é ignorado em silêncio, não
 * quebra nada. `picture` sai como STRING VAZIA quando `null` (nunca `null`
 * no JSON) — mesma convenção do Go (`sql.NullString.String`, que é `""`
 * quando a coluna é `NULL`) e do tipo `picture: string` (não `string | null`)
 * dos dois lados do `apps/web`.
 */
authRoutes.get('/me', requireAuth<AuthBindings>(), (c) => {
  const user = c.get('votacaoUser')
  return okJson({
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture ?? '',
    is_admin: user.isAdmin,
    created_at: user.createdAt,
  })
})

/**
 * Delega a invalidação de sessão ao Better Auth (`auth.api.signOut`) — nunca
 * reimplementa a limpeza do cookie/linha de `session` à mão. Sem
 * `requireAuth`: o `POST /auth/logout` do Go (`router.go`) também é público
 * (não passa por `RequireAuth`) — encerrar uma sessão que já não existe é
 * um no-op válido, não um erro.
 *
 * `asResponse: true` é o que dá acesso aos headers `Set-Cookie` que limpam
 * o cookie de sessão no navegador (`deleteSessionCookie`, dentro do próprio
 * endpoint do Better Auth) — sem isso, chamar `signOut` sem `asResponse`
 * devolveria só `{ success: boolean }` cru, sem cookie nenhum pra propagar,
 * e o cookie velho continuaria válido no browser do usuário até expirar
 * sozinho.
 */
authRoutes.post('/logout', async (c) => {
  const signOutResponse = await getAuth(c.env).api.signOut({
    headers: c.req.raw.headers,
    asResponse: true,
  })

  const res = okJson({ loggedOut: true })
  for (const cookie of signOutResponse.headers.getSetCookie()) {
    res.headers.append('set-cookie', cookie)
  }
  return res
})

export default authRoutes
