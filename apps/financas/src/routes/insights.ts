import { Hono, type MiddlewareHandler } from 'hono'
import {
  createInsight,
  insightNumbers,
  latestInsight,
} from '../domain/insights'
import { errJson, okJson } from '../lib/envelope'
import { type AuthBindings } from '../lib/auth'
import { addMonthsToCompetence } from '../lib/dates'
import {
  chamarPromeia,
  PromeiaDemorou,
  PromeiaInalcancavel,
  PromeiaRecusou,
  PromeiaRespostaIlegivel,
  promeiaConfigurado,
  type PromeiaBindings,
} from '../lib/promeia'
import { requireSession } from '../lib/session'

// Convenção de módulo (accounts.ts/.../recurring.ts/reserve.ts): type Env
// LOCAL, nunca import de Bindings de ../index — evita ciclo de import
// valor↔tipo. `Bindings` aqui replica o `Bindings` final de src/index.ts
// (AuthBindings & INGEST_TOKEN & PromeiaBindings) porque, desde a Task 4 do
// comando do Mac, esta rota passou a precisar das DUAS coisas: o segredo de
// ingestão (requireIngestToken/requireIngestTokenOrSession, abaixo) e — só
// pra GET /insights/numbers — o caminho de sessão do Better Auth
// (requireSession, importado de ../lib/session), pro navegador continuar
// lendo essa rota exatamente como antes. `PromeiaBindings` entrou com
// POST /insights/generate, que fecha a cadeia no sentido oposto: o
// INGEST_TOKEN é o Mac escrevendo AQUI, PROMEIA_URL/PROMEIA_TOKEN são este
// Worker chamando o MAC.
type Bindings = AuthBindings & { INGEST_TOKEN: string } & PromeiaBindings
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

/**
 * ⚠️ **A JANELA DE ESPERA É ESCOLHA MEDIDA, não número mágico.** A spike
 * cronometrou os dois lados da cadeia contra o promeia e o túnel REAIS:
 *
 * | O que                                                   | Medido            |
 * | ------------------------------------------------------- | ----------------- |
 * | Ollama gerando o insight, mês com dado real             | **20,3 - 26,2 s** |
 * | Ollama com o modelo FRIO (`keep_alive` de 5 min vencido) | **32,8 s**        |
 * | Ida e volta pelo túnel (`GET /health`)                  | 0,30 s            |
 * | Falhas rápidas (Mac off / token errado / competência inválida) | **0,3 - 0,4 s** |
 *
 * 8 s fica no vale entre os dois grupos, com folga de uma ordem de grandeza
 * pra cada lado: **toda falha real cabe dentro** (0,4 s ≪ 8 s, então o dono
 * recebe o erro acionável na hora, nunca um "gerando" que esconde "o Mac
 * está fora"), e **nenhuma geração bem-sucedida cabe** (20 s ≫ 8 s, então o
 * 202 é o caminho normal do caminho feliz, não uma exceção). Encurtar pra
 * ~1 s começaria a devolver 202 pra falha; esticar pra ~40 s prenderia o
 * navegador pelo tempo inteiro de uma rodada de GPU sem ganhar nada — o
 * promeia publica sozinho de qualquer forma.
 *
 * ⚠️ **`ctx.waitUntil()` está DESCARTADO POR MEDIÇÃO**, não por preferência:
 * o teto dele é **30 s**, MENOR que o caso frio de 32,8 s — ou seja, ele
 * cortaria justamente o cenário mais comum (Mac recém-ligado, modelo não
 * carregado). Também não é necessário: quem termina o trabalho é o promeia,
 * não o Worker (ver abaixo).
 *
 * ⚠️ **Abandonar a espera NÃO cancela a geração.** `run_insight`
 * (`apps/promeia/src/promeia/insight.py`) faz `POST /api/insights` **por
 * conta própria** antes de responder — a resposta ao navegador é confirmação
 * redundante, não o canal de entrega. E `gerar_insight` é um `def`
 * SÍNCRONO, então o Starlette o roda em threadpool sem checar desconexão:
 * abortar o fetch daqui não interrompe o trabalho de lá. É isso que torna o
 * 202 honesto — "gerando" quer dizer gerando de verdade, e o resultado
 * aparece em `GET /api/insights/latest` quando ficar pronto.
 */
export const ESPERA_CURTA_MS = 8_000

/** Feature desligada (sem `PROMEIA_URL`/`PROMEIA_TOKEN`), não quebrada. */
const MSG_PROMEIA_DESLIGADO =
  'A geração de insight está desligada — configure PROMEIA_URL e ' +
  'PROMEIA_TOKEN (wrangler secret put).'

function traduzirFalhaPromeia(err: unknown): Response {
  if (err instanceof PromeiaInalcancavel) {
    // Ninguém respondeu: a ação é ligar o Mac / subir o serviço.
    return errJson(503, 'promeia_unreachable', err.message)
  }
  if (err instanceof PromeiaRespostaIlegivel) {
    // ⚠️ Alguém RESPONDEU, e o corpo é que não deu pra ler — o oposto do
    // ramo acima. Mandar "suba o promeia no Mac" aqui é a pior mensagem
    // possível (manda arrumar o que está certo), e era exatamente o que
    // aconteceria se este ramo não existisse: o corpo do 502 é comido pelo
    // túnel (ver PromeiaRespostaIlegivel em lib/promeia.ts).
    console.error(
      'promeia respondeu num formato irreconhecível',
      err.status,
      err.amostra,
    )
    return errJson(
      502,
      'promeia_ilegivel',
      `O promeia respondeu HTTP ${err.status} num formato que não reconheço. ` +
        'O Mac respondeu — então NÃO é caso de subir o serviço; confira o log ' +
        'do promeia (e `wrangler tail` deste Worker).',
    )
  }
  if (err instanceof PromeiaRecusou) {
    // O promeia está de pé e recusou. Repassa o código E a mensagem dele —
    // é o que distingue "abra o Ollama" de "rode ollama pull X" de "o texto
    // foi gerado mas a publicação falhou". Achatar num "falhou" genérico
    // jogaria fora a única parte acionável.
    //
    // ⚠️ `publish_failed` carrega `data.texto` (a leitura que já custou
    // 20-33 s de GPU) no corpo do erro do promeia. `chamarPromeia` só
    // devolve `data` no caminho FELIZ, então esse texto não chega ao
    // navegador hoje — limitação conhecida, registrada aqui em vez de
    // resolvida por adivinhação: exibir um insight que NÃO foi persistido
    // exigiria uma tela que sabe distinguir "salvo" de "só na tela", e isso
    // é decisão de produto, não de tradução de erro.
    const status = err.status >= 500 ? err.status : 502
    return errJson(status, err.code, err.message)
  }
  // Qualquer outra coisa é bug daqui, não do promeia: sobe pro
  // `app.onError` global (500 internal_error dentro do envelope, causa real
  // só no `console.error`) — mesma convenção do `throw err` das rotas acima.
  throw err
}

/**
 * `POST /api/insights/generate` — o BOTÃO que substitui o `make insight`.
 *
 * Cadeia inteira: **navegador → este Worker → túnel → promeia (Mac) →
 * Ollama → `POST /api/insights` de volta neste Worker**. O navegador nunca
 * fala com o Mac (carregaria o `PROMEIA_TOKEN`, e token no cliente é token
 * público — ver o cabeçalho de `lib/promeia.ts`).
 *
 * ⚠️ **Fica atrás da sessão, como toda rota deste Worker** — e isso é por
 * AUSÊNCIA deliberada, não por um guard local: `src/index.ts` aplica
 * `requireSession()` a `/api/*` e abre exceção só pra `/api/health`,
 * `/api/auth/*`, `POST /api/insights` (exato) e `GET
 * /api/insights/numbers`. Esta rota **não entra em nenhuma dessas
 * exceções** — nem deve: o `INGEST_TOKEN` é do comando que roda no Mac,
 * quem clica o botão é o dono no navegador. Provado por teste contra o app
 * montado de verdade (`routes/insights.test.ts`, describe "sem sessão"),
 * que também confirma que o `fetch` pro promeia nunca chega a ser chamado.
 */
insightsRoutes.post('/insights/generate', async (c) => {
  const cfg = promeiaConfigurado(c.env)
  // Desligado ≠ quebrado: sem os dois secrets a feature simplesmente não
  // existe neste ambiente (mesmo padrão de `sheets_disabled`/`promeia_disabled`
  // do ramielle). 503 com mensagem que diz o que configurar, nunca 500.
  if (cfg === null) {
    return errJson(503, 'promeia_disabled', MSG_PROMEIA_DESLIGADO)
  }

  let corpo: { competence?: unknown }
  try {
    corpo = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  // `competence` é OPCIONAL — ausente, o promeia usa o mês corrente (em
  // Teresina, `competencia_atual()`).
  let competence: string | undefined
  if (corpo.competence !== undefined && corpo.competence !== null) {
    if (typeof corpo.competence !== 'string') {
      return errJson(
        422,
        'invalid_competence',
        'competence precisa ser uma string YYYY-MM',
        'competence',
      )
    }
    try {
      // Mesma técnica de `byCategory`/`createInsight`: `addMonthsToCompetence(x, 0)`
      // valida o formato reusando a validação central de lib/dates.ts, sem
      // uma segunda regex. Validar aqui evita gastar uma ida ao Mac pra
      // receber o mesmo 422 de lá (o promeia devolve `invalid_competence`
      // — MESMO código, de propósito: o front lê a mesma coisa venha de
      // onde vier).
      addMonthsToCompetence(corpo.competence, 0)
    } catch (err) {
      if (err instanceof RangeError) {
        return errJson(422, 'invalid_competence', err.message, 'competence')
      }
      throw err
    }
    competence = corpo.competence
  }

  try {
    const data = await chamarPromeia<{
      competence?: unknown
      texto?: unknown
      modelo?: unknown
    }>('/insight', { competence: competence ?? null }, cfg, {
      timeoutMs: ESPERA_CURTA_MS,
    })

    if (typeof data?.texto !== 'string' || data.texto === '') {
      // 200 com um `data` fora do formato é a mesma classe de problema do
      // corpo ilegível: alguém respondeu e eu não entendi. Nunca "o Mac
      // está fora".
      console.error('promeia devolveu 200 sem `data.texto`', data)
      return errJson(
        502,
        'promeia_ilegivel',
        'O promeia respondeu sucesso, mas sem o texto do insight. O Mac ' +
          'respondeu — confira o log do promeia.',
      )
    }

    return okJson({
      competence: typeof data.competence === 'string' ? data.competence : null,
      texto: data.texto,
      modelo: typeof data.modelo === 'string' ? data.modelo : null,
    })
  } catch (err) {
    if (err instanceof PromeiaDemorou) {
      // Caminho NORMAL do caso feliz (geração leva 20-33 s, a janela é 8 s):
      // nada se perde, porque o promeia publica sozinho. A tela mostra
      // "gerando" e relê `GET /api/insights/latest` depois.
      return okJson({ status: 'gerando' }, 202)
    }
    return traduzirFalhaPromeia(err)
  }
})
