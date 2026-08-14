import type {
  AdminUsersResponse,
  BackupsResponse,
  CategoriesResponse,
  CreateSessionBody,
  ResultsResponse,
  TiebreakResponse,
  SessionDetail,
  SessionListResponse,
  SessionVotesResponse,
  User,
} from './types'

export const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/** A single structured message from the API (matches Go internal/httpx). */
export interface ApiNotification {
  type: 'error' | 'warning' | 'success' | 'info'
  code?: string
  message: string
  field?: string
}

/** The standard envelope every API route returns. */
export interface ApiEnvelope<T> {
  ok: boolean
  data: T
  notifications: ApiNotification[]
}

/**
 * ApiError carries the standardized notifications so callers can show a clean,
 * human message (`.message`) and branch on a stable `.code` (e.g. 'already_voted').
 */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly notifications: ApiNotification[]

  constructor(status: number, notifications: ApiNotification[]) {
    const primary =
      notifications.find((n) => n.type === 'error') ?? notifications[0]
    super(primary?.message ?? `Erro ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = primary?.code
    this.notifications = notifications
  }
}

/** errorMessage extracts a user-facing message from any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Erro inesperado. Tente novamente.'
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  // Every route returns the envelope; 204 (legacy / no-body) is tolerated.
  let env: ApiEnvelope<T> | null = null
  if (res.status !== 204) {
    env = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  }

  if (!res.ok) {
    const notifications = env?.notifications ?? [
      { type: 'error' as const, message: `${res.status} ${res.statusText}` },
    ]
    throw new ApiError(res.status, notifications)
  }

  return (env?.data ?? undefined) as T
}

export const votacaoApi = {
  me: () => call<User>('/auth/me'),
  logout: () => call<void>('/auth/logout', { method: 'POST' }),

  listSessions: () => call<SessionListResponse>('/votacao/sessions'),
  getSession: (id: number) => call<SessionDetail>(`/votacao/sessions/${id}`),
  vote: (id: number, movieIds: number[]) =>
    call<{ voted_movie_ids: number[] }>(`/votacao/sessions/${id}/votes`, {
      method: 'POST',
      body: JSON.stringify({ movie_ids: movieIds }),
    }),
  closeSession: (id: number) =>
    call<{ winner_movie_id: number | null }>(`/votacao/sessions/${id}/close`, {
      method: 'POST',
    }),
  tiebreak: (id: number, entropy: string) =>
    call<TiebreakResponse>(`/votacao/sessions/${id}/tiebreak`, {
      method: 'POST',
      body: JSON.stringify({ entropy }),
    }),
  results: (id: number) =>
    call<ResultsResponse>(`/votacao/sessions/${id}/results`),

  categories: () => call<CategoriesResponse>('/votacao/categorias'),
  createSession: (body: CreateSessionBody) =>
    call<SessionDetail>('/votacao/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Admin-only
  adminUsers: () => call<AdminUsersResponse>('/admin/users'),
  adminSessionVotes: (id: number) =>
    call<SessionVotesResponse>(`/votacao/sessions/${id}/votes`),
  adminBackups: () => call<BackupsResponse>('/admin/backups'),
  adminCreateBackup: () => call<null>('/admin/backup', { method: 'POST' }),
}

/**
 * Inicia o login social com Google via Better Auth (Cutover T2 — ramielle).
 *
 * Substitui a antiga navegação top-level `<a href="${apiBase}/auth/google/login">`:
 * essa rota não existe no ramielle (404, cai no catch-all — ver
 * task-2-brief.md). O login lá é `POST /api/auth/sign-in/social`, que devolve
 * `{ url, redirect }` no ramo sem `idToken` (o nosso — login social
 * redirecionando pro Google, não app nativo trocando um id token; o outro
 * ramo do contrato devolve `{token, user}` e nunca é alcançado por este
 * chamador). O cliente é quem navega, não o servidor (verificado contra o
 * pacote `better-auth@1.6.25` instalado, `dist/api/routes/sign-in.mjs`).
 * Sem lib nova (`better-auth` não é dependência de apps/web e não vira uma só
 * pra montar uma URL — Global Constraint desta fatia): fetch puro. `redirect`
 * é ignorado de propósito — é `!disableRedirect`, sempre `true` aqui (nunca
 * mandamos `disableRedirect`), então não carrega informação nova.
 *
 * `callbackURL`/`errorCallbackURL` são SEMPRE absolutas (`window.location.href`,
 * a página atual) — quem processa o callback OAuth (sucesso OU erro) é o
 * ramielle, em outra origem; um path relativo (o padrão do finanças, mesma
 * origem lá) resolveria contra `ramielle.piluvitu.com.br`, não contra
 * `piluvitu.com.br`. Isso vale pros dois campos, não só `callbackURL`:
 * `errorCallbackURL` alimenta `redirectOnError` (`dist/oauth2/errors.mjs`),
 * chamado por 13 pontos do callback OAuth core (`dist/api/routes/callback.mjs`),
 * que faz `` `${errorURL}${sep}${params}` `` — concatenação de string crua,
 * sem resolver contra `baseURL`. Um `errorCallbackURL` relativo cairia no
 * `Location:` do redirect resolvido pelo BROWSER contra a origem do request
 * que disparou o callback (o ramielle), não contra `piluvitu.com.br`.
 * Preserva o destino do usuário no round trip pelo mesmo motivo do `Gate.tsx`
 * do finanças carregar o hash: sem isso, expirar a sessão em `/votacao/5`
 * devolveria o usuário pra uma rota default depois do login, não pra onde
 * ele estava.
 *
 * ⚠️ **Guarda de esquema (fix round 1, I2).** O cliente oficial do Better
 * Auth faz a MESMA checagem antes de navegar (`dist/client/fetch-plugins.mjs`,
 * `isSafeUrlScheme` — JSDoc da lib: "guard browser navigation sinks and any
 * redirect target that may originate from untrusted input"). Como aqui é
 * `fetch` puro (decisão de zero-dep), a guarda não vem de graça — precisa
 * ser replicada à mão, senão `body.url` alimenta `window.location.href` sem
 * checagem nenhuma. Sem a guarda, um `body.url` malicioso (ramielle
 * comprometido, ou `NEXT_PUBLIC_API_URL` mal cadastrada apontando pro host
 * errado — cenário concreto: cadastrar essa variável à mão é um passo do
 * runbook da T6) poderia conter `javascript:`/`data:`/`vbscript:`, e
 * `window.location.href = url` executaria no documento ATUAL
 * (`piluvitu.com.br`), não no ramielle — XSS local. `new URL(body.url)`
 * (lança se não for absoluta) + checar `protocol` é `http:`/`https:` cobre
 * o mesmo risco sem precisar da lib inteira.
 */
export async function startGoogleLogin(options?: {
  /** Override só de teste — em produção sempre `window.location.href = url`. */
  navigate?: (url: string) => void
}): Promise<void> {
  const navigate =
    options?.navigate ??
    ((url: string) => {
      window.location.href = url
    })
  const destino = window.location.href

  let res: Response
  try {
    res = await fetch(`${apiBase}/api/auth/sign-in/social`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        callbackURL: destino,
        errorCallbackURL: destino,
      }),
    })
  } catch {
    throw new Error(
      'Não foi possível iniciar o login com Google. Verifique sua conexão e tente novamente.',
    )
  }

  const body = (await res.json().catch(() => null)) as { url?: string } | null

  if (!res.ok || !body?.url) {
    throw new Error(
      'Não foi possível iniciar o login com Google. Tente novamente.',
    )
  }

  // Guarda de esquema — ver o bloco ⚠️ no JSDoc acima. `new URL()` lança
  // pra strings não-absolutas (ex.: um path relativo por engano), o que já
  // cai no mesmo `catch` do parse de baixo.
  let urlSegura: URL
  try {
    urlSegura = new URL(body.url)
    if (urlSegura.protocol !== 'http:' && urlSegura.protocol !== 'https:') {
      throw new Error('esquema não permitido')
    }
  } catch {
    throw new Error(
      'O servidor de login devolveu um destino inválido. Tente novamente.',
    )
  }

  navigate(urlSegura.toString())
}
