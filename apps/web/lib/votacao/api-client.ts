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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
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
