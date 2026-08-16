/**
 * Cliente do promeia — o serviço Python (FastAPI + Ollama) que roda no
 * MacBook do dono, atrás de um túnel Cloudflare.
 *
 * ⚠️ **Cópia deliberada de `apps/ramielle/src/lib/promeia.ts`**, como as
 * outras cópias entre Workers deste monorepo (`chunk`, os helpers de
 * envelope, `toIsoUtc`): os dois Workers são bundles/runtimes separados, não
 * há fronteira de import entre eles. O que está aqui NÃO é uma reescrita —
 * o aprendizado medido do original foi preservado inteiro (a classificação
 * 520-527/530 do túnel, o timeout, a distinção "não alcancei" × "alcancei e
 * ele recusou") — mais duas classes NOVAS que a spike deste módulo exigiu
 * (`PromeiaDemorou` e `PromeiaRespostaIlegivel`, ver abaixo).
 *
 * ⚠️ **O navegador NUNCA fala com o Mac.** O túnel torna
 * `promeia.piluvitu.com.br` alcançável pela internet inteira; sem
 * autenticação isso é **GPU do dono publicada de graça**. A cadeia é
 * obrigatoriamente **navegador → financas (Worker) → túnel → promeia →
 * Ollama**: o Worker guarda o `PROMEIA_TOKEN` como secret e o navegador
 * nunca o vê. Chamar o promeia direto do navegador exigiria o token no
 * cliente — ou seja, público.
 *
 * ⚠️ **A distinção dos modos de falha é o produto, não detalhe.** "Não
 * alcancei o Mac" e "alcancei e ele recusou" mandam o dono para lados
 * OPOSTOS: um manda ligar o Mac, o outro manda abrir o Ollama / rodar
 * `ollama pull`. Trocar os dois faz perder tempo arrumando o que já está
 * certo — é a mesma regra que os CLIs deste projeto já seguem
 * (`ECONNREFUSED` ≠ "a API me recusou").
 */

/** Bindings que ligam este módulo. Secrets, nunca `vars` do wrangler.jsonc. */
export type PromeiaBindings = {
  PROMEIA_URL?: string
  PROMEIA_TOKEN?: string
}

export type PromeiaConfig = {
  baseUrl: string
  token: string
}

/** Não alcancei o Mac: DNS, conexão recusada, túnel caído. */
export class PromeiaInalcancavel extends Error {
  constructor(mensagem: string = MSG_INALCANCAVEL) {
    super(mensagem)
    this.name = 'PromeiaInalcancavel'
  }
}

/**
 * Estourou a espera DESTE lado — e isso **não é falha**: quem chamou pediu
 * uma janela curta de propósito (ver `ESPERA_CURTA_MS` em
 * `routes/insights.ts`). O promeia continua trabalhando no Mac e publica
 * sozinho; abortar o fetch daqui não interrompe o trabalho de lá.
 *
 * ⚠️ **Divergência DELIBERADA do original do ramielle**, onde um timeout
 * vira `PromeiaInalcancavel` (lá o timeout de 120 s só acontece quando algo
 * está de fato errado, então "suba o promeia" é a leitura certa). Aqui a
 * espera curta é o desenho: reportá-la como "suba o promeia no Mac" seria a
 * mensagem ERRADA no caminho MAIS COMUM — geração de insight leva 20,3-32,8 s
 * medidos, então estourar 8 s é o esperado, não o excepcional.
 */
export class PromeiaDemorou extends Error {
  /** Janela que foi dada, em ms — o que de fato expirou. */
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(
      `o promeia não respondeu em ${timeoutMs} ms — ele segue trabalhando no Mac`,
    )
    this.name = 'PromeiaDemorou'
    this.timeoutMs = timeoutMs
  }
}

/** Alcancei o Mac e ele recusou/falhou — o gargalo é outro. */
export class PromeiaRecusou extends Error {
  /** `code` que o promeia emitiu (`ollama_unreachable`, `publish_failed`, …). */
  readonly code: string
  /** Status HTTP que o promeia devolveu. */
  readonly status: number

  constructor(mensagem: string, code: string, status: number) {
    super(mensagem)
    this.name = 'PromeiaRecusou'
    this.code = code
    this.status = status
  }
}

/**
 * ⚠️ **Classe NOVA em relação ao ramielle: "não respondeu" e "respondeu e eu
 * não entendi o corpo" mandam o dono para lados OPOSTOS, então colapsá-las
 * num tipo só é o próprio bug.** O original do ramielle classifica todo
 * "erro HTTP sem `code`/`message`" como inalcançável; aqui isso diria "suba
 * o promeia no Mac" para um Mac que respondeu — a pior mensagem possível,
 * porque manda arrumar o que já está certo.
 *
 * ⚠️ **O 502 do túnel NÃO é caso desta classe — é ausência de origem.** Ver
 * `STATUS_502_TUNEL_SEM_ORIGEM` abaixo para a medição e a regra; foi
 * exatamente essa confusão (o modo de queda MAIS COMUM produzindo a
 * mensagem invertida) que a revisão pegou.
 *
 * O que SOBRA para esta classe, e é por isso que ela continua existindo:
 * corpo que não dá nem pra ler, `200` com corpo não-JSON (ou JSON que não é
 * objeto), e qualquer erro HTTP **fora** do 502 cujo corpo não tenha o shape
 * do promeia — 500 e 503, MEDIDOS, atravessam o túnel com o JSON INTACTO
 * (tabela em `STATUS_502_TUNEL_SEM_ORIGEM`), então um 500/503 sem
 * `code`+`message` é mesmo alguém respondendo num formato que não reconheço,
 * nunca "o Mac está fora".
 */
export class PromeiaRespostaIlegivel extends Error {
  /** Status que chegou (pode ser o da origem OU o que o túnel reescreveu). */
  readonly status: number
  /** Trecho curto do corpo, só pra log — nunca vai pro corpo da resposta. */
  readonly amostra: string

  constructor(status: number, amostra: string) {
    super(
      `o promeia respondeu HTTP ${status} num formato que não reconheço — ` +
        'alguém do outro lado respondeu, então isto NÃO é "o Mac está fora"',
    )
    this.name = 'PromeiaRespostaIlegivel'
    this.status = status
    this.amostra = amostra
  }
}

/** Texto FIXO — nunca montado a partir da URL, do erro cru ou do request. */
export const MSG_INALCANCAVEL =
  'Não consegui alcançar o promeia no Mac. Ligue o Mac, suba o serviço ' +
  '(`make dev-promeia`) e tente de novo.'

/**
 * Timeout PADRÃO por chamada. Generoso porque o caso normal do promeia é uma
 * rodada de modelo local (20,3-32,8 s medidos) — curto demais aqui viraria
 * "não alcancei" numa situação em que o Mac está trabalhando.
 *
 * ⚠️ Quem quer uma janela CURTA (a rota de insight quer: 8 s, ver
 * `ESPERA_CURTA_MS` em `routes/insights.ts`) passa `timeoutMs` e trata
 * `PromeiaDemorou` como resultado normal — não é este default que decide.
 */
export const TIMEOUT_MS = 120_000

/** Tamanho do trecho de corpo guardado pra log em `PromeiaRespostaIlegivel`. */
const AMOSTRA_MAX = 200

type CorpoPromeia = {
  code?: unknown
  message?: unknown
  data?: unknown
}

/**
 * Status HTTP que a própria Cloudflare documenta como "não alcancei a
 * origem" (o túnel está de pé, o Mac atrás dele não está) — 520-527 e 530.
 * Evidência de ausência que vale SOZINHA, sem olhar o corpo: o promeia não
 * emite esses status por contrato, e a Cloudflare não fala o shape dele.
 */
const STATUS_CLOUDFLARE_ORIGEM_INALCANCAVEL = new Set([
  520, 521, 522, 523, 524, 525, 526, 527, 530,
])

/**
 * ⚠️ **O SEGUNDO modo de queda do túnel, e o MAIS COMUM dos dois.** Medido
 * 3/3 de cada lado contra a cadeia real:
 *
 * | Cenário                              | O que volta                             | Latência |
 * | ------------------------------------ | --------------------------------------- | -------- |
 * | `cloudflared` NO AR + promeia PARADO | **502**, text/plain, 16 b `error code: 502` | 0,18 s |
 * | `cloudflared` parado                 | 530, `error code: 1033`                 | 0,13 s   |
 *
 * O primeiro é o caso do dia a dia: `cloudflared` é serviço docker
 * (`infra-cloudflared-1`, no ar há dias), e o promeia é comando de terminal
 * que não sobrevive a reboot — "túnel de pé, serviço fora" é o normal. Tratar
 * esse 502 como corpo ilegível dizia ao dono *"o Mac respondeu — então NÃO é
 * caso de subir o serviço"*, ou seja, o proibia de fazer a ÚNICA coisa que
 * resolve. Provado ponta a ponta: porta fechada ⇒ `503 promeia_unreachable`
 * ("Ligue o Mac, suba o serviço") ✅; túnel real com o promeia parado ⇒
 * `502 promeia_ilegivel` ❌.
 *
 * **A REGRA, e por que é esta:** `502` **E** corpo que não é o envelope do
 * promeia (`code`+`message`) ⇒ **ausência de origem**.
 *
 * - **Por que o corpo entra na regra, e não só o status:** hoje
 *   `apps/promeia/src/promeia/insight.py` não emite NENHUM 502 no fluxo de
 *   insight (os sete ramos viraram 503 no commit `d6eb69c`), então um 502
 *   aqui só pode ser da Cloudflare. Mas isso é propriedade do código do
 *   OUTRO lado do túnel, não contrato que este Worker controla — manter a
 *   condição do corpo custa nada e garante que um 502 que um dia venha COM
 *   `code`+`message` seja REPASSADO (`PromeiaRecusou`, a mensagem acionável
 *   dele) em vez de virar "o Mac está fora".
 * - **Por que NÃO o par (status, content-type):** `text/plain` é o formato
 *   do error page da Cloudflare HOJE; o 530 da mesma família já chega como
 *   HTML. A pergunta que a decisão precisa responder é "isto veio do
 *   promeia?", e quem responde isso é o SHAPE do corpo — que já é computado
 *   logo abaixo. Amarrar a regra ao content-type a faria quebrar no dia em
 *   que a Cloudflare mudasse o error page, e quebrar de volta para a
 *   mensagem INVERTIDA, que é o defeito que ela existe pra consertar.
 * - **Por que só 502, e não 500 também:** MEDIDO — 401, 422, 500 e 503 da
 *   origem atravessam o túnel com o **JSON INTACTO**; só o 502 é comido. Um
 *   500/503 sem `code`+`message` é, portanto, alguém que não é o promeia
 *   respondendo num formato estranho: `PromeiaRespostaIlegivel` de verdade.
 *   Estender a regra a eles apagaria a distinção que aquela classe existe
 *   pra fazer, e traria de volta a regra do ramielle que este módulo
 *   deliberadamente não copiou.
 */
const STATUS_502_TUNEL_SEM_ORIGEM = 502

/**
 * POST autenticado no promeia. Devolve o `data` do corpo em caso de sucesso.
 *
 * ⚠️ **O token nunca entra em mensagem de erro.** Nenhuma das mensagens
 * abaixo é construída a partir da URL completa (que não o carrega hoje, mas
 * carregaria se alguém o movesse pra query string) nem do objeto de request
 * — mesma regra do cliente do TMDb do ramielle, pelo mesmo motivo.
 */
export async function chamarPromeia<T>(
  caminho: string,
  corpo: unknown,
  cfg: PromeiaConfig,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<T> {
  const f = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${caminho}`

  const controller = new AbortController()
  // `expirou` é o que separa "a JANELA acabou" (PromeiaDemorou, esperado) de
  // "o fetch morreu" (PromeiaInalcancavel, o Mac está fora): os dois chegam
  // aqui como a MESMA rejeição do fetch, e sem esta flag seriam
  // indistinguíveis.
  let expirou = false
  const timeoutId = setTimeout(() => {
    expirou = true
    controller.abort()
  }, timeoutMs)

  let resposta: Response
  try {
    resposta = await f(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    })
  } catch {
    clearTimeout(timeoutId)
    // Texto FIXO: nem o erro original (que em alguns runtimes ecoa a
    // requisição inteira, headers inclusos) nem a URL entram aqui.
    if (expirou) throw new PromeiaDemorou(timeoutMs)
    throw new PromeiaInalcancavel()
  }

  // ⚠️ O `clearTimeout` fica DEPOIS da leitura do corpo, não logo depois do
  // fetch. Lição medida em `apps/ramielle/src/lib/publishers/http.ts` (achado
  // I1 daquela task): limpar o timer assim que os HEADERS chegam deixa todo
  // `.text()`/`.json()` seguinte SEM limite de tempo — e uma janela de 8 s
  // que o corpo pode furar não é uma janela de 8 s.
  let bruto: string | null
  try {
    bruto = await resposta.text()
  } catch {
    bruto = null
  } finally {
    clearTimeout(timeoutId)
  }

  if (bruto === null) {
    if (expirou) throw new PromeiaDemorou(timeoutMs)
    throw new PromeiaRespostaIlegivel(resposta.status, '<corpo ilegível>')
  }

  let json: CorpoPromeia | null = null
  try {
    const parsed: unknown = JSON.parse(bruto)
    // `JSON.parse('5')`/`'null'` são JSON válidos e NÃO são o envelope do
    // promeia — sem esta checagem, `json.code` num número lançaria depois.
    json = typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    json = null
  }

  const amostra = bruto.slice(0, AMOSTRA_MAX)

  if (!resposta.ok) {
    // Só a faixa documentada pela Cloudflare prova AUSÊNCIA. Ela é
    // deliberadamente autoritativa (vence até um corpo que pareça do
    // promeia): o promeia não emite esses status por contrato.
    if (STATUS_CLOUDFLARE_ORIGEM_INALCANCAVEL.has(resposta.status)) {
      throw new PromeiaInalcancavel()
    }

    // Toda rota do promeia que devolve erro (`_erro` em `insight.py`,
    // `TokenMiddleware` em `auth.py`) SEMPRE inclui `code`+`message` no
    // JSON. Sem os dois, quem respondeu não foi ele.
    // Checks inline (não numa `const` boolean) DE PROPÓSITO — é o que deixa
    // o TypeScript estreitar `json` pra `{code: string, message: string}`
    // depois deste `if`, sem cast nenhum.
    if (
      json === null ||
      typeof json.code !== 'string' ||
      json.code === '' ||
      typeof json.message !== 'string' ||
      json.message === ''
    ) {
      // 502 + corpo que não é do promeia = o túnel sem origem atrás dele
      // (`cloudflared` no ar, promeia parado — o modo de queda mais comum).
      // Ausência, não corpo ilegível: a ação é subir o serviço. Ver a regra
      // inteira, e por que ela é (status + shape) e não (status +
      // content-type), em STATUS_502_TUNEL_SEM_ORIGEM acima.
      if (resposta.status === STATUS_502_TUNEL_SEM_ORIGEM) {
        throw new PromeiaInalcancavel()
      }
      // Qualquer outro status sem o shape dele: ALGUÉM respondeu e eu não
      // entendi — nunca "o Mac está fora" (500/503 chegam com JSON intacto,
      // medido).
      throw new PromeiaRespostaIlegivel(resposta.status, amostra)
    }

    // A mensagem do promeia é MELHOR que qualquer coisa que o Worker
    // inventaria aqui: ela distingue "o Ollama está desligado, abra ele" de
    // "o modelo não está instalado, rode `ollama pull X`". Repassar, nunca
    // achatar num "falhou" genérico.
    throw new PromeiaRecusou(json.message, json.code, resposta.status)
  }

  if (json === null) {
    throw new PromeiaRespostaIlegivel(resposta.status, amostra)
  }

  return json.data as T
}

/**
 * O recurso está configurado? Sem as duas bindings, a feature está DESLIGADA
 * — não quebrada.
 *
 * ⚠️ Mesmo padrão (e mesma função) do ramielle, pelo mesmo motivo medido lá:
 * credencial ausente é "feature off" (503 `promeia_disabled`), nunca erro de
 * execução. Um 502 aqui mandaria o dono investigar uma falha que não existe.
 */
export function promeiaConfigurado(env: PromeiaBindings): PromeiaConfig | null {
  const baseUrl = env.PROMEIA_URL ?? ''
  const token = env.PROMEIA_TOKEN ?? ''
  if (baseUrl === '' || token === '') return null
  return { baseUrl, token }
}
