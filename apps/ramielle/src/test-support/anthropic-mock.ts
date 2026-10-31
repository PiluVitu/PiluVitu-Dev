/**
 * `fetch` global falso da API da Anthropic para os testes do ramielle: nenhum
 * teste alcança a API de verdade. Qualquer URL que não seja
 * api.anthropic.com/v1/messages lança, para o teste acusar a chamada perdida.
 */
import { vi } from 'vitest'

export type PedidoAnthropic = {
  model: string
  max_tokens: number
  system: string
  messages: { role: string; content: string }[]
  [campo: string]: unknown
}

export function respostaClaude(
  texto: string,
  sobrescrever: Record<string, unknown> = {},
): Response {
  return Response.json({
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: texto }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
    ...sobrescrever,
  })
}

export function erroClaude(status: number, tipo: string): Response {
  return Response.json(
    { type: 'error', error: { type: tipo, message: 'erro da API' } },
    // retry-after-ms curto para o retry da SDK não atrasar o teste.
    { status, headers: { 'retry-after-ms': '1' } },
  )
}

export function mockarAnthropic(
  responder: (pedido: PedidoAnthropic) => Response | Promise<Response>,
): PedidoAnthropic[] {
  const pedidos: PedidoAnthropic[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init)
    if (req.url !== 'https://api.anthropic.com/v1/messages') {
      throw new Error(`fetch sem mock: ${req.url}`)
    }
    const pedido = (await req.json()) as PedidoAnthropic
    pedidos.push(pedido)
    return responder(pedido)
  })
  return pedidos
}

// O proofread manda {"blocos": [...]} no user e espera o mesmo formato de
// volta; este responder corrige cada bloco com `corrigir`.
export function blocosDoPedido(pedido: PedidoAnthropic): string[] {
  const conteudo = pedido.messages[0]?.content ?? ''
  return (JSON.parse(conteudo) as { blocos: string[] }).blocos
}

export function responderLote(
  corrigir: (bloco: string) => string,
): (pedido: PedidoAnthropic) => Response {
  return (pedido) =>
    respostaClaude(
      JSON.stringify({ blocos: blocosDoPedido(pedido).map(corrigir) }),
    )
}
