import Anthropic from '@anthropic-ai/sdk'
import type {
  MessageCreateParamsNonStreaming,
  Usage,
} from '@anthropic-ai/sdk/resources/messages'
import { custoMicroUsd, type Modelo } from './custo'
import {
  ClaudeDesligado,
  ClaudeIndisponivel,
  ClaudeRecusou,
  type MotivoRecusa,
} from './erros'

export type PedidoClaude = {
  modelo: Modelo
  system: string
  user: string
  maxTokens: number
  formatoJson?: object
}

export type RespostaClaude = { texto: string; uso: Usage; custoMicro: number }

export async function chamarClaude(
  apiKey: string | undefined,
  pedido: PedidoClaude,
  opts: { fetch?: typeof fetch } = {},
): Promise<RespostaClaude> {
  if (!apiKey) throw new ClaudeDesligado()

  // baseURL e authToken fixos: sem eles a SDK lê ANTHROPIC_BASE_URL e
  // ANTHROPIC_AUTH_TOKEN do process.env, e a chave poderia sair para outro host.
  const client = new Anthropic({
    apiKey,
    authToken: null,
    baseURL: 'https://api.anthropic.com',
    fetch: opts.fetch,
    maxRetries: 1,
    // O log da SDK vai para o console do Worker; desligado para que nada da
    // requisição (nem a chave) chegue ao log.
    logLevel: 'off',
  })

  const params: MessageCreateParamsNonStreaming = {
    model: pedido.modelo,
    max_tokens: pedido.maxTokens,
    system: pedido.system,
    messages: [{ role: 'user', content: pedido.user }],
  }
  if (pedido.formatoJson) {
    params.output_config = {
      format: {
        type: 'json_schema',
        schema: pedido.formatoJson as Record<string, unknown>,
      },
    }
  }

  let resposta: Anthropic.Message
  try {
    resposta = await client.messages.create(params)
  } catch (err) {
    throw traduzirErro(err, pedido.modelo)
  }

  if (resposta.stop_reason === 'refusal') throw new ClaudeRecusou('recusa')
  if (
    resposta.stop_reason === 'max_tokens' ||
    resposta.stop_reason === 'model_context_window_exceeded'
  ) {
    throw new ClaudeRecusou('formato')
  }

  const texto = resposta.content
    .flatMap((bloco) => (bloco.type === 'text' ? [bloco.text] : []))
    .join('')
    .trim()
  if (!texto) throw new ClaudeRecusou('formato')

  return {
    texto,
    uso: resposta.usage,
    custoMicro: custoMicroUsd(pedido.modelo, resposta.usage),
  }
}

function motivoDoStatus(status: number): MotivoRecusa {
  if (status === 401 || status === 403) return 'chave_invalida'
  if (status === 402) return 'cobranca'
  if (status === 404) return 'modelo_indisponivel'
  return 'requisicao_invalida'
}

function traduzirErro(err: unknown, modelo: Modelo): Error {
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ClaudeIndisponivel(undefined, true)
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ClaudeIndisponivel()
  }
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
    const { status } = err
    if (status === 408 || status === 409 || status === 429 || status >= 500) {
      return new ClaudeIndisponivel(status)
    }
    return new ClaudeRecusou(motivoDoStatus(status), status, modelo)
  }
  return new ClaudeIndisponivel()
}
