export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Notification = {
  type: 'error' | 'warning' | 'info'
  code: string
  message: string
}
type Envelope<T> = {
  ok: boolean
  data: T | null
  notifications: Notification[]
}

/**
 * `path` é o caminho completo, incluindo o prefixo /api (ex.: '/api/accounts').
 * UI e API moram no mesmo host — não existe base URL configurável.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }

  const envelope = body as Envelope<T> | null
  if (!envelope || typeof envelope.ok !== 'boolean') {
    throw new ApiError(
      res.status,
      'invalid_envelope',
      `resposta sem envelope (HTTP ${res.status})`,
    )
  }

  if (!envelope.ok) {
    const notes = envelope.notifications ?? []
    const note = notes.find((n) => n.type === 'error') ?? notes[0]
    throw new ApiError(
      res.status,
      note?.code ?? 'unknown',
      note?.message ?? 'erro desconhecido',
    )
  }

  return envelope.data as T
}
