import type {
  CategoriesResponse,
  CreateSessionBody,
  ResultsResponse,
  SessionDetail,
  SessionListResponse,
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
  vote: (id: number, movieId: number) =>
    call<void>(`/votacao/sessions/${id}/votes`, {
      method: 'POST',
      body: JSON.stringify({ movie_id: movieId }),
    }),
  closeSession: (id: number) =>
    call<{ winner_movie_id: number | null }>(`/votacao/sessions/${id}/close`, {
      method: 'POST',
    }),
  results: (id: number) =>
    call<ResultsResponse>(`/votacao/sessions/${id}/results`),

  categories: () => call<CategoriesResponse>('/votacao/categorias'),
  createSession: (body: CreateSessionBody) =>
    call<SessionDetail>('/votacao/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

export const loginHref = `${apiBase}/auth/google/login`
