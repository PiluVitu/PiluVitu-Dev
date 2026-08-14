/**
 * Cliente do promeia — o serviço Python que roda no MacBook do dono.
 *
 * ⚠️ **Este módulo existe por causa da §3 do spec, e a razão não é
 * organizacional.** O túnel torna `promeia.piluvitu.com.br` alcançável pela
 * internet inteira; sem autenticação isso é **GPU do dono publicada de
 * graça**. O fluxo é obrigatoriamente **navegador → ramielle → promeia**: o
 * Worker guarda o `PROMEIA_TOKEN` como secret e o navegador NUNCA o vê.
 * Chamar o promeia direto do navegador exigiria o token no cliente — ou seja,
 * público.
 *
 * ⚠️ **A distinção dos dois modos de falha é o produto, não detalhe** (§5 do
 * spec): "não alcancei o Mac" e "alcancei e ele recusou" nunca podem virar a
 * mesma frase. Mandar o dono subir um serviço que já está de pé faz perder
 * tempo no lugar errado — é a mesma regra que os CLIs deste projeto já
 * seguem (`ECONNREFUSED` ≠ "a API me recusou").
 */

export type PromeiaConfig = {
  baseUrl: string
  token: string
}

/** Não alcancei o Mac: DNS, conexão recusada, timeout, túnel caído. */
export class PromeiaInalcancavel extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'PromeiaInalcancavel'
  }
}

/** Alcancei o Mac e ele recusou/falhou — o gargalo é outro. */
export class PromeiaRecusou extends Error {
  /** `code` que o promeia emitiu (`ollama_unreachable`, `invalid_json`, …). */
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
 * Timeout por chamada. Generoso: um `proofread` de artigo longo faz uma
 * chamada ao modelo POR BLOCO de prosa, e um modelo frio leva dezenas de
 * segundos só pra primeira token. Curto demais aqui vira "não alcancei" numa
 * situação em que o Mac está trabalhando — a pior mensagem possível, porque
 * manda o dono mexer no que está certo.
 */
export const TIMEOUT_MS = 120_000

type CorpoPromeia = {
  code?: string
  message?: string
  data?: unknown
}

/**
 * Status HTTP que a própria Cloudflare documenta como "não alcancei a
 * origem" (o túnel está de pé, o Mac atrás dele não está) — 520-527 e 530.
 * Ver a checagem de corpo abaixo pra por que isto é redundante na prática
 * (a Cloudflare nunca emite o shape `{code,message}` do promeia) e por que
 * mantenho os dois mesmo assim.
 */
const STATUS_CLOUDFLARE_ORIGEM_INALCANCAVEL = new Set([
  520, 521, 522, 523, 524, 525, 526, 527, 530,
])

/**
 * POST autenticado no promeia. Devolve o `data` do corpo em caso de sucesso.
 *
 * ⚠️ **O token nunca entra em mensagem de erro.** Nenhuma das mensagens
 * abaixo é construída a partir da URL completa (que não o carrega hoje, mas
 * carregaria se alguém o movesse pra query string) nem do objeto de request.
 * Mesma regra do cliente do TMDb (`lib/tmdb.ts`), pelo mesmo motivo.
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
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

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
    // Texto FIXO: nem o erro original (que em alguns runtimes ecoa a
    // requisição inteira, headers inclusos) nem a URL entram aqui.
    throw new PromeiaInalcancavel(
      'Suba o promeia no Mac para usar este recurso.',
    )
  } finally {
    clearTimeout(timeoutId)
  }

  let json: CorpoPromeia | null = null
  try {
    json = (await resposta.json()) as CorpoPromeia
  } catch {
    json = null
  }

  if (!resposta.ok) {
    // ⚠️ I2 (revisão): um erro HTTP SEM `code`/`message` reconhecíveis no
    // corpo NÃO é evidência de que o promeia recusou — é evidência de que o
    // promeia nunca respondeu. Toda rota do promeia que devolve erro
    // (`_erro` em `revisao_rotas.py`, e `TokenMiddleware`) SEMPRE inclui os
    // dois no JSON. Quem responde SEM esse shape é a INFRAESTRUTURA entre o
    // navegador e o Mac — o túnel Cloudflare, quando o Mac está desligado ou
    // travado: HTML de erro (530) ou um 524 de timeout, nunca
    // `{ok,code,message}`. Medido pelo revisor com o app real: os dois
    // casos caíam no ramo "RECUSOU" (o `?? 'promeia_failed'` escondia a
    // ausência), e a frase da §5 ("Suba o promeia no Mac") — que existe
    // exatamente pra este cenário — nunca aparecia. `resposta.status` sendo
    // um dos códigos que a própria Cloudflare documenta como "não alcancei
    // a origem" (520-527, 530) é checado à parte, redundante na prática (a
    // Cloudflare não emite o shape do promeia), mas explícito porque a
    // distinção "não alcancei" × "recusou" é o PRODUTO desta função, não um
    // acidente de parsing.
    // Checks inline (não numa `const` boolean à parte) DE PROPÓSITO — é o
    // que deixa o TypeScript estreitar `json` pra `{code: string, message:
    // string}` depois deste `if`, sem cast nenhum na hora de montar o
    // PromeiaRecusou logo abaixo.
    if (
      json === null ||
      typeof json.code !== 'string' ||
      json.code === '' ||
      typeof json.message !== 'string' ||
      json.message === '' ||
      STATUS_CLOUDFLARE_ORIGEM_INALCANCAVEL.has(resposta.status)
    ) {
      throw new PromeiaInalcancavel(
        'Suba o promeia no Mac para usar este recurso.',
      )
    }

    // A mensagem do promeia é MELHOR que qualquer coisa que o Worker
    // inventaria aqui: ela distingue "o Ollama está desligado, abra ele" de
    // "o modelo não está instalado, rode `ollama pull X`". Repassar, não
    // achatar num "falhou" genérico — é o que a §5 do spec pede.
    throw new PromeiaRecusou(json.message, json.code, resposta.status)
  }

  if (json === null || typeof json !== 'object') {
    throw new PromeiaRecusou(
      'O promeia respondeu num formato inesperado.',
      'promeia_failed',
      resposta.status,
    )
  }

  return json.data as T
}

/**
 * O recurso está configurado? Sem as duas bindings, a feature está DESLIGADA
 * — não quebrada.
 *
 * ⚠️ Mesmo padrão do `sheets_disabled` da fatia ③, e pelo mesmo motivo
 * medido lá: a Go trata credencial ausente como "feature off" (503), não
 * como erro de execução (502). Um 502 aqui mandaria o dono investigar uma
 * falha que não existe.
 */
export function promeiaConfigurado(env: {
  PROMEIA_URL?: string
  PROMEIA_TOKEN?: string
}): PromeiaConfig | null {
  const baseUrl = env.PROMEIA_URL ?? ''
  const token = env.PROMEIA_TOKEN ?? ''
  if (baseUrl === '' || token === '') return null
  return { baseUrl, token }
}
