import { Hono } from 'hono'
import { emergencyStatus, EMERGENCY_ACCOUNTS_KEY } from '../domain/reserve'
import { setSetting } from '../domain/settings'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

// Convenção de módulo (accounts.ts/transactions.ts/.../settings.ts/
// recurring.ts): type Env LOCAL, nunca import de Bindings de ../index —
// evita ciclo de import valor↔tipo.
type Env = { Bindings: { DB: D1Database } }

// "default 3 meses do custo fixo, calculado, não digitado" (spec §5) — a
// análise original do dono apontava 3 a 6 meses; 3 é o piso conservador.
// Mesmo raciocínio de DEFAULT_FIXED_NET_CENTS/resolveFixedNetCents
// (routes/reports.ts): a lógica de ONDE o parâmetro vem mora na ROTA, não
// no domínio — emergencyStatus() recebe goal_months já resolvido, sem saber
// de onde veio (nenhuma configuração de goal_months existe ainda; fica para
// uma fatia futura, junto com o simulador de compra do §6 do spec).
const DEFAULT_GOAL_MONTHS = 3

export const reserveRoutes = new Hono<Env>()

reserveRoutes.get('/reserve', async (c) => {
  const raw = c.req.query('goal_months')
  let goal_months = DEFAULT_GOAL_MONTHS
  // Query string malformada é SEMPRE 400 neste módulo (nunca 422) — mesma
  // regra de `commitments()`/`from`,`months` (routes/reports.ts): valor
  // estruturalmente inválido em query é erro do CHAMADOR da URL, não
  // conteúdo de formulário.
  if (raw !== undefined) {
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0) {
      return errJson(
        400,
        'invalid_query',
        'goal_months precisa ser um número inteiro positivo',
      )
    }
    goal_months = n
  }

  const status = await emergencyStatus(c.env.DB, { goal_months })
  // goal_months entra no envelope pra SPA saber contra qual meta o piso
  // está sendo comparado (o alerta de "abaixo da meta" precisa do número,
  // não só do resultado já calculado) — emergencyStatus() em si não devolve
  // isso (Task 1, já mergeada), então a rota anexa ao serializar.
  return okJson({ ...status, goal_months })
})

reserveRoutes.put('/reserve/accounts', async (c) => {
  let body: { account_ids?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  const ids = body.account_ids
  // Corpo (não query string) ⇒ 422, nunca 400 — regra do módulo.
  if (!Array.isArray(ids) || !ids.every((v) => typeof v === 'string')) {
    return errJson(
      422,
      'constraint_violation',
      'account_ids precisa ser uma lista de ids (strings)',
      'account_ids',
    )
  }

  // Validação de existência ANTES de gravar — mesmo princípio de
  // `createAccount`/`setFixedNetCents` (TS/aplicação valida antes do
  // banco): um id inexistente não pode deixar rastro, nem sobrescrever
  // parcialmente uma designação anterior válida. `settings.value` é TEXT
  // opaco (sem FK pra `accounts`), então não existe um SQLITE_CONSTRAINT de
  // verdade pra capturar aqui — a checagem é feita à mão, mas o resultado
  // passa pelo MESMO tratamento cozido (`friendlyConstraintMessage` +
  // `logConstraintError`) que todo outro "referência inválida" deste
  // módulo usa, nunca um texto solto reinventado nesta rota.
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',')
    const res = await c.env.DB.prepare(
      `SELECT id FROM accounts WHERE id IN (${placeholders})`,
    )
      .bind(...ids)
      .all<{ id: string }>()
    const found = new Set(res.results.map((r) => r.id))
    const missing = ids.filter((id) => !found.has(id))
    if (missing.length > 0) {
      const raw = `FOREIGN KEY constraint failed: emergency_accounts.account_id -> accounts.id (nao encontrado: ${missing.join(', ')})`
      logConstraintError('PUT /reserve/accounts', raw)
      return errJson(
        422,
        'constraint_violation',
        friendlyConstraintMessage(raw),
      )
    }
  }

  await setSetting(c.env.DB, EMERGENCY_ACCOUNTS_KEY, JSON.stringify(ids))
  return okJson({ account_ids: ids })
})
