/**
 * Envelope único de resposta JSON do Worker de finanças.
 *
 * Mesmo shape do Go API (apps/api/internal/httpx/respond.go):
 *   { "ok": bool, "data": <payload>|null, "notifications": [ {type, code, message} ] }
 *
 * Mensagens (erro, aviso, info) vivem SEMPRE em `notifications`, para o
 * front-end lê-las do mesmo lugar em qualquer rota. `notifications` nunca
 * serializa como null — é [] quando não há nenhuma.
 *
 * Duas diferenças deliberadas em relação ao Go, travadas no contrato desta
 * fatia: aqui não existe o tipo 'success' nem o campo opcional `field`.
 */
export type NotificationKind = 'error' | 'warning' | 'info'

export type Notification = {
  type: NotificationKind
  code: string
  message: string
}

export type Envelope<T> = {
  ok: boolean
  data: T | null
  notifications: Notification[]
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

export function okJson<T>(data: T, status = 200): Response {
  const body: Envelope<T> = { ok: true, data, notifications: [] }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export function errJson(
  status: number,
  code: string,
  message: string,
): Response {
  const body: Envelope<never> = {
    ok: false,
    data: null,
    notifications: [{ type: 'error', code, message }],
  }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
