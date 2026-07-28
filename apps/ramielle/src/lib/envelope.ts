/**
 * Envelope único de resposta JSON do Worker ramielle.
 *
 *   { "ok": bool, "data": <payload>|null, "notifications": [ {type, code, message, field?} ] }
 *
 * Portado de apps/financas/src/lib/envelope.ts — contrato compartilhado com
 * o Go (apps/api) e com o apps/web, não redesenhado aqui. Mensagens (erro,
 * aviso, info) vivem SEMPRE em `notifications`, para o front-end lê-las do
 * mesmo lugar em qualquer rota. `notifications` nunca serializa como null —
 * é [] quando não há nenhuma. `field` é opcional: ausente quando a
 * notification não é sobre um campo específico, e some do JSON nesse caso,
 * nunca vira null.
 *
 * `'success'` NÃO existe em `NotificationKind`: é especulativo — o cliente
 * decide o toast de sucesso pelo `ok: true` da própria resposta, sem
 * precisar de uma notification carregando isso. Entra depois, com motivo
 * concreto, se algum dia fizer falta (mesma decisão do finanças).
 */
export type NotificationKind = 'error' | 'warning' | 'info'

export type Notification = {
  type: NotificationKind
  code: string
  message: string
  /** Campo ofensor num erro de validação (ex.: 'email', 'session_id'). */
  field?: string
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
  field?: string,
): Response {
  const body: Envelope<never> = {
    ok: false,
    data: null,
    // field undefined some do JSON (JSON.stringify descarta chave com valor
    // undefined em objeto) — nunca vira `"field":null`.
    notifications: [{ type: 'error', code, message, field }],
  }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
