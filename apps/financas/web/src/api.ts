import { authClient } from './auth-client'

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
    const code = note?.code ?? 'unknown'

    // I2 (fix final): um 401 not_authenticated numa rota de DOMÍNIO (não
    // /api/auth/*) não é visto pelo átomo de sessão do Better Auth sozinho
    // — ele só refaz fetch no primeiro mount, em $sessionSignal, em
    // visibilitychange e em reconexão; nenhum desses dispara aqui. Sem
    // isto, a sessão expira, toda tela passa a mostrar o erro cru em vez
    // de voltar pro login, e o header continua de pé com e-mail/"Sair"
    // (Gate nunca re-renderiza porque o átomo mantém seu `data` antigo).
    // $store.notify('$sessionSignal') é o MESMO mecanismo que signOut() já
    // usa pra re-gatear na mesma aba (ver Gate.tsx/auth-client.ts) —
    // dispara um refetch de /get-session, que devolve null, e o átomo
    // atualiza `data` pra null, fazendo o Gate voltar pra tela de login.
    if (res.status === 401 && code === 'not_authenticated') {
      authClient.$store.notify('$sessionSignal')
    }

    throw new ApiError(res.status, code, note?.message ?? 'erro desconhecido')
  }

  return envelope.data as T
}
