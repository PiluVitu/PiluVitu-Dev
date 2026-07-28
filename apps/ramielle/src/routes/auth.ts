/**
 * `GET /auth/me` e `POST /auth/logout` — paridade de shape com o Go
 * (`apps/api/internal/auth/handlers.go#Me`/`#Logout`).
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
 * ⚠️ Shape: exatamente `id`, `name`, `email`, `picture`, `is_admin` — 5
 * campos, casando com o `Handlers.Me` real do Go (`internal/auth/
 * handlers.go`, linhas 108-114) e com o tipo `User` de `apps/web/lib/
 * votacao/types.ts` (que também não declara `created_at`). NÃO copiar os 6
 * campos do `ListUsers`/`AdminUser` do admin — aquele é outro endpoint
 * (`/admin/users`), outro shape.
 *
 * Fix round 1 desta task: a primeira versão desta rota incluía
 * `created_at` (instrução do brief original, que citou os dois handlers Go
 * como referência sem notar que eles têm shapes diferentes). Cortado porque
 * a fatia ② constrói em cima deste endpoint — um campo que "só funciona
 * porque TypeScript não valida resposta de `fetch`" é dívida silenciosa. Se
 * uma tela algum dia precisar de `created_at`, ele entra como campo
 * DECLARADO no tipo `User`, não como propriedade implícita que sobra da
 * resposta.
 *
 * `google_sub` NUNCA sai (o Go já o omite de propósito do shape de `User`).
 * `picture` sai como STRING VAZIA quando `null` (nunca `null` no JSON) —
 * mesma convenção do Go (`sql.NullString.String`, que é `""` quando a
 * coluna é `NULL`) e do tipo `picture: string` (não `string | null`) do
 * `apps/web`.
 */
authRoutes.get('/me', requireAuth<AuthBindings>(), (c) => {
  const user = c.get('votacaoUser')
  return okJson({
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture ?? '',
    is_admin: user.isAdmin,
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
