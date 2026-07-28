import { Hono, type MiddlewareHandler } from 'hono'
import {
  createInsight,
  insightNumbers,
  latestInsight,
} from '../domain/insights'
import { errJson, okJson } from '../lib/envelope'
import { type AuthBindings } from '../lib/auth'
import { requireSession } from '../lib/session'

// Convenção de módulo (accounts.ts/.../recurring.ts/reserve.ts): type Env
// LOCAL, nunca import de Bindings de ../index — evita ciclo de import
// valor↔tipo. `Bindings` aqui replica o `Bindings` final de src/index.ts
// (AuthBindings & INGEST_TOKEN) porque, desde a Task 4 do comando do Mac,
// esta rota passou a precisar das DUAS coisas: o segredo de ingestão
// (requireIngestToken/requireIngestTokenOrSession, abaixo) e — só pra
// GET /insights/numbers — o caminho de sessão do Better Auth
// (requireSession, importado de ../lib/session), pro navegador continuar
// lendo essa rota exatamente como antes.
type Bindings = AuthBindings & { INGEST_TOKEN: string }
type Env = { Bindings: Bindings }

export const insightsRoutes = new Hono<Env>()

/**
 * Confere só o header — pura, sem tocar em `next()`/resposta. Extraída
 * pra ser reusada pelas DUAS guardas abaixo (POST /insights exige só
 * token; GET /insights/numbers aceita token OU sessão) sem duplicar a
 * regra de fail-closed.
 */
function ingestTokenValido(
  header: string | undefined,
  esperado: string,
): boolean {
  const [scheme, token] = (header ?? '').split(' ')
  // Fail-closed: INGEST_TOKEN ausente/vazio (secret nunca configurado)
  // nunca autentica ninguém — mesmo princípio de isAllowedEmail
  // (lib/auth.ts), onde um segredo vazio barra todo mundo em vez de
  // liberar geral.
  return scheme === 'Bearer' && !!token && !!esperado && token === esperado
}

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
    if (!ingestTokenValido(c.req.header('authorization'), c.env.INGEST_TOKEN)) {
      return errJson(
        401,
        'invalid_ingest_token',
        'token de ingestão ausente ou inválido',
      )
    }
    await next()
  }
}

/**
 * Extensão de escopo (Task 4 do comando no Mac): o MESMO INGEST_TOKEN que
 * já escrevia insight (requireIngestToken, acima) passa a também LER
 * `GET /insights/numbers` — e SÓ essa rota. Decisão registrada no brief da
 * Task 4: essa rota devolve agregado (totais por categoria/período, via
 * `insightNumbers`/`byCategory`), nunca lançamento cru — o escopo do token
 * continua honesto (lê totais, escreve prosa) mesmo depois desta
 * extensão, e o livro-caixa (`/api/accounts`, `/api/transactions`, ...)
 * continua inalcançável por ele (ver src/index.test.ts, describe
 * "fronteira do INGEST_TOKEN").
 *
 * Um `Authorization: Bearer` PRESENTE decide sozinho o resultado — válido
 * autentica, inválido barra com `invalid_ingest_token` — nunca cai pro
 * fallback de sessão por trás (evita a ambiguidade de "o header errado
 * silenciosamente virou uma tentativa de sessão"). SÓ a ausência total do
 * header cai no caminho de sempre: `requireSession`, igual toda outra
 * leitura do app — o navegador continua exatamente como antes desta task.
 */
function requireIngestTokenOrSession(): MiddlewareHandler<Env> {
  const guardaSessao = requireSession<Bindings>()
  return async (c, next) => {
    const header = c.req.header('authorization')
    if (header === undefined) {
      return guardaSessao(c, next)
    }
    if (!ingestTokenValido(header, c.env.INGEST_TOKEN)) {
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
// rodado. GET /insights/latest usa só sessão de navegador — a exceção do
// middleware global (index.ts) cobre POST /insights e, desde a Task 4,
// GET /insights/numbers também; latest fica de fora das duas.
insightsRoutes.get('/insights/latest', async (c) => {
  const insight = await latestInsight(c.env.DB)
  return okJson(insight)
})

insightsRoutes.get(
  '/insights/numbers',
  requireIngestTokenOrSession(),
  async (c) => {
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
  },
)

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
