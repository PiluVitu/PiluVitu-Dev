/**
 * Envelope único de resposta JSON do Worker ramielle.
 *
 *   { "ok": bool, "data": <payload>|null, "notifications": [ {type, code, message, field?} ] }
 *
 * Portado de apps/financas/src/lib/envelope.ts — contrato compartilhado com
 * o Go (apps/api) e com o apps/web, não redesenhado aqui. Mensagens (erro,
 * aviso, info, sucesso) vivem SEMPRE em `notifications`, para o front-end
 * lê-las do mesmo lugar em qualquer rota. `notifications` nunca serializa
 * como null — é [] quando não há nenhuma. `field` é opcional: ausente
 * quando a notification não é sobre um campo específico, e some do JSON
 * nesse caso, nunca vira null.
 *
 * `'success'` foi deliberadamente OMITIDO na Task 1/2 desta fatia — era
 * especulativo, porque nenhuma rota portada até então precisava dele (o
 * cliente decide o toast pelo `ok: true` da própria resposta). A Task 3
 * (voto) é o "motivo concreto" citado naquela decisão: o Go usa
 * `httpx.DataMsg(..., httpx.Success("Voto registrado."))` — `NotifySuccess`
 * é um valor REAL do envelope Go (`apps/api/internal/httpx/respond.go`), e
 * `apps/web/lib/votacao/api-client.ts` já tipa `ApiNotification.type` como
 * `'error' | 'warning' | 'success' | 'info'` HÁ TEMPO — o wire já previa
 * este valor, só nenhuma rota anterior o emitia. Isto é paridade de
 * CONTRATO, não uma tela nova: `call<T>()` em api-client.ts devolve só
 * `data` no caminho feliz e descarta `notifications` inteiro — nenhum toast
 * de sucesso aparece por causa disto.
 */
export type NotificationKind = 'error' | 'warning' | 'info' | 'success'

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

/**
 * `notifications` é opcional e default `[]` — todo chamador existente
 * (`okJson(data)`, `okJson(data, status)`) continua se comportando
 * IDÊNTICO a antes desta task; o terceiro parâmetro só existe pra rotas
 * como o voto, que precisam ecoar uma confirmação (`httpx.DataMsg` +
 * `httpx.Success(...)` no Go) junto do payload de sucesso.
 */
export function okJson<T>(
  data: T,
  status = 200,
  notifications: Notification[] = [],
): Response {
  const body: Envelope<T> = { ok: true, data, notifications }
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
