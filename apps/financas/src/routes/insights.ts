import { Hono, type MiddlewareHandler } from 'hono'
import {
  createInsight,
  insightNumbers,
  latestInsight,
} from '../domain/insights'
import { errJson, okJson } from '../lib/envelope'

// Convenção de módulo (accounts.ts/.../recurring.ts/reserve.ts): type Env
// LOCAL, nunca import de Bindings de ../index — evita ciclo de import
// valor↔tipo. INGEST_TOKEN só é lido por esta rota (requireIngestToken,
// abaixo) — nenhuma outra rota do módulo conhece este binding.
type Env = { Bindings: { DB: D1Database; INGEST_TOKEN: string } }

export const insightsRoutes = new Hono<Env>()

/**
 * Guarda SÓ desta rota (spec §3 / brief Task 3, Step 3): o caminho de
 * sessão do navegador (src/index.ts#requireSession, aplicado a /api/*
 * globalmente) fica intocado — index.ts abre uma exceção SÓ para
 * `POST /api/insights` (mesmo padrão das exceções de `/api/health` e
 * `/api/auth/*` já existentes), e é ESTA guarda, presa diretamente à
 * rota, quem decide se a requisição passa daqui pra frente. Presa aqui
 * (não em index.ts) porque o próprio contrato HTTP da rota — "token
 * Bearer, nada mais" — é o que este arquivo é dono de definir; testável
 * em isolamento (routes/insights.test.ts monta só este router, sem tocar
 * index.ts), mesma convenção de toda outra rota do módulo.
 *
 * Escopo mínimo (spec §3): este token autentica ESCRITA de insight, nada
 * mais — não existe em nenhum outro binding/rota do módulo. Uma sessão de
 * navegador válida (cookie) NUNCA substitui o header: a checagem abaixo
 * olha só a `Authorization`, nunca `c.req.raw.headers.get('cookie')` nem
 * nada relacionado a sessão — mesmo com um cookie de sessão genuíno no
 * request, sem o header correto a resposta é 401 (ver
 * src/index.test.ts, "sessão não abre a ingestão").
 */
function requireIngestToken(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const [scheme, token] = header.split(' ')
    // Fail-closed: INGEST_TOKEN ausente/vazio (secret nunca configurado)
    // nunca autentica ninguém — mesmo princípio de isAllowedEmail
    // (lib/auth.ts), onde um segredo vazio barra todo mundo em vez de
    // liberar geral.
    if (
      scheme !== 'Bearer' ||
      !token ||
      !c.env.INGEST_TOKEN ||
      token !== c.env.INGEST_TOKEN
    ) {
      return errJson(
        401,
        'invalid_ingest_token',
        'token de ingestão ausente ou inválido',
      )
    }
    await next()
  }
}

// Sem sessão nem token: números são calculados por consulta exata (spec
// §3) e a tela precisa vê-los mesmo que o comando do Mac nunca tenha
// rodado. Ambas as rotas GET usam sessão de navegador — a exceção do
// middleware global fica só em POST /insights (ver index.ts).
insightsRoutes.get('/insights/latest', async (c) => {
  const insight = await latestInsight(c.env.DB)
  return okJson(insight)
})

insightsRoutes.get('/insights/numbers', async (c) => {
  const competence = c.req.query('competence') ?? ''

  try {
    const numbers = await insightNumbers(c.env.DB, { competence })
    return okJson(numbers)
  } catch (err) {
    // RangeError só pode vir da validação de formato de `competence`
    // (insightNumbers → addMonthsToCompetence) — query string malformada,
    // por isso 400 (mesmo padrão de commitments()/byCategory em
    // routes/reports.ts), nunca 422.
    if (err instanceof RangeError) {
      return errJson(400, 'invalid_query', err.message)
    }
    throw err
  }
})

insightsRoutes.post('/insights', requireIngestToken(), async (c) => {
  let body: { texto?: unknown; modelo?: unknown; periodo?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  if (
    typeof body.texto !== 'string' ||
    typeof body.modelo !== 'string' ||
    typeof body.periodo !== 'string'
  ) {
    return errJson(
      422,
      'invalid_insight',
      'texto, modelo e periodo precisam ser strings',
    )
  }

  try {
    // Só texto/modelo/periodo saem do corpo pro domínio — qualquer outro
    // campo (ex.: um generated_at que o chamador tente mandar) é
    // descartado aqui: createInsight nem aceita esse campo no tipo
    // NewInsight, e generated_at é SEMPRE o relógio do servidor (ver
    // ⚠️ em domain/insights.ts).
    const insight = await createInsight(c.env.DB, {
      texto: body.texto,
      modelo: body.modelo,
      periodo: body.periodo,
    })
    return okJson(insight, 201)
  } catch (err) {
    if (err instanceof RangeError) {
      return errJson(422, 'invalid_insight', err.message)
    }
    throw err
  }
})
