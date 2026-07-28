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
import { getAuth, isAdminEmail, type AuthBindings } from './auth'
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
 * O `sub` de verdade do Google fica em `account.accountId` (`providerId =
 * 'google'`, migration 0002) — `getSession()` NUNCA o expõe, só
 * `sessao.user.id` (o id INTERNO do Better Auth, gerado por ele).
 *
 * ⚠️ Por que isto importa pra valer, não é purismo de nome de coluna: a
 * fatia ④ (cutover) vai IMPORTAR o histórico real de votação da API Go, cujo
 * `users.google_sub` está preenchido com o `sub` do Google. Se o ramielle
 * gravasse `sessao.user.id` (valor que o Go NUNCA usou) em vez do `sub` real,
 * casar a importação por `google_sub` criaria uma SEGUNDA linha pra cada
 * pessoa que já votou — a mesma pessoa duplicada, e os votos antigos ficando
 * órfãos de identidade. Com a tabela vazia (estado atual), isto é de graça;
 * com linhas já gravadas seria preciso uma migration extra só pra recalcular
 * a coluna, além da importação em si.
 */
async function buscarGoogleSub(
  db: D1Database,
  betterAuthUserId: string,
): Promise<string | null> {
  const conta = await db
    .prepare(
      `SELECT accountId FROM account WHERE userId = ? AND providerId = 'google' LIMIT 1`,
    )
    .bind(betterAuthUserId)
    .first<{ accountId: string }>()
  return conta?.accountId ?? null
}

/**
 * Isolado de `requireAuth`/`requireAdmin` de propósito: é o que evita
 * duplicar o `try/catch` de `getSession` e o upsert nos dois guards — cada
 * um só decide o que fazer com o resultado (deixar passar, ou também exigir
 * `isAdmin`).
 */
async function resolveSession<TBindings extends AuthBindings>(
  c: Context<SessionEnv<TBindings>>,
): Promise<SessionResolution> {
  // I1 (revisão final da fatia): o try ANTES cobria só getSession. Fora
  // dele, no mesmo caminho de todo request autenticado, ainda rodavam
  // buscarGoogleSub (SELECT em account) e upsertVotacaoUser (INSERT...
  // ON CONFLICT...RETURNING + um SELECT, que lança Error explícito em dois
  // pontos de domain/users.ts) — nenhum dos três protegido. Cenário real: a
  // migration 0002 aplicada em produção e a 0001 não (pendência do dono,
  // `wrangler d1 migrations apply` pode parar no meio) — o login completa
  // (só precisa de user/session/account), e todo GET /auth/me subsequente
  // estoura `no such table: users` sem o catch cobrir. Estendido até o fim
  // da função: as quatro operações de D1 do caminho (getSession,
  // buscarGoogleSub, o upsert, o SELECT de volta) caem no mesmo 503
  // auth_unavailable. Ver session.test.ts, describe "D1 indisponível a
  // partir da segunda consulta" — prova isto com um proxy que deixa passar
  // as duas queries de getSession e quebra a partir da terceira
  // (buscarGoogleSub em diante); sem esta extensão do try, aquele teste
  // falha.
  try {
    const sessao = await getAuth(c.env).api.getSession({
      headers: c.req.raw.headers,
    })

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

    // Fallback pra sessao.user.id NÃO É FOLGA — é o que preserva o controle
    // positivo dos testes deste arquivo. O cookie de teste é gerado via
    // `emailAndPassword`/`signUpEmail` (mesma técnica do finanças): esse
    // caminho NUNCA cria uma linha em `account` com `providerId='google'` (só
    // login social real cria). Sem o fallback, todo teste de sessão quebraria
    // por um motivo que não tem nada a ver com o que eles provam — em
    // produção o login é 100% Google, então o caminho real sempre acha a
    // linha em `account`, e o fallback nunca dispara.
    const googleSubEncontrado = await buscarGoogleSub(c.env.DB, sessao.user.id)
    if (googleSubEncontrado === null) {
      // M2 (revisão final): sem isto, o fallback é SILENCIOSO. Se ele
      // disparar em produção (sessão sem linha em account com
      // providerId='google' — não deveria acontecer no login 100% Google,
      // mas "não deveria" não é "não vai"), grava o id INTERNO do Better
      // Auth em users.google_sub — precisamente o defeito que o fix da T4
      // corrigiu, e que na fatia ④ (importação do histórico da API Go)
      // duplica usuário e orfaniza voto antigo. Uma linha de warn torna
      // isso detectável em `wrangler tail` em vez de invisível.
      console.warn(
        'buscarGoogleSub: sem linha em account (providerId=google) para este usuário — usando fallback sessao.user.id como google_sub',
      )
    }
    const googleSub = googleSubEncontrado ?? sessao.user.id

    const votacaoUser = await upsertVotacaoUser(c.env.DB, {
      googleSub,
      email: sessao.user.email,
      name: sessao.user.name,
      picture: sessao.user.image ?? null,
      isAdmin: isAdminEmail(sessao.user.email, c.env.ADMIN_EMAILS),
    })

    return { ok: true, votacaoUser }
  } catch (err) {
    // Cobre as quatro operações de D1 acima (getSession, buscarGoogleSub, o
    // upsert e o SELECT de volta). Sem este catch o erro vazaria como 500
    // sem envelope, e o cliente do apps/web levantaria 'invalid_envelope' —
    // um sintoma sem relação nenhuma com a causa real.
    console.error(
      'resolveSession falhou (getSession/buscarGoogleSub/upsertVotacaoUser)',
      err,
    )
    return {
      ok: false,
      response: errJson(
        503,
        'auth_unavailable',
        'não foi possível validar a sessão agora',
      ),
    }
  }
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
