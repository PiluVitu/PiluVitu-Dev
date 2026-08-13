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
  ok?: boolean
  code?: string
  message?: string
  data?: unknown
}

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
    // A mensagem do promeia é MELHOR que qualquer coisa que o Worker
    // inventaria aqui: ela distingue "o Ollama está desligado, abra ele" de
    // "o modelo não está instalado, rode `ollama pull X`". Repassar, não
    // achatar num "falhou" genérico — é o que a §5 do spec pede.
    const mensagem =
      typeof json?.message === 'string' && json.message !== ''
        ? json.message
        : `O promeia recusou a requisição (HTTP ${resposta.status}).`
    const code =
      typeof json?.code === 'string' && json.code !== ''
        ? json.code
        : 'promeia_failed'
    throw new PromeiaRecusou(mensagem, code, resposta.status)
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
