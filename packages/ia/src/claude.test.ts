import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chamarClaude, type PedidoClaude } from './claude'
import { custoMicroUsd } from './custo'
import { ClaudeDesligado, ClaudeIndisponivel, ClaudeRecusou } from './erros'

const SENTINELA = 'sk-ant-SENTINELA-nao-vaze'

const PEDIDO: PedidoClaude = {
  modelo: 'claude-haiku-5-5',
  system: 'Você revisa textos.',
  user: 'Olá, mundo.',
  maxTokens: 100,
}

type Chamada = { url: string; init: RequestInit }

// Toda exceção lançada pelo describe passa por aqui; o afterAll confere que
// nenhuma mensagem carrega a chave (Review Focus 3).
const lancadas: unknown[] = []

function respostaOk(sobrescrever: Record<string, unknown> = {}): Response {
  return Response.json({
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: '  oi  ' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
    ...sobrescrever,
  })
}

function respostaErro(status: number, tipo: string): Response {
  return Response.json(
    {
      type: 'error',
      error: { type: tipo, message: `erro cru da API com ${SENTINELA}` },
    },
    // retry-after-ms curto para o retry da SDK não atrasar o teste.
    { status, headers: { 'retry-after-ms': '1' } },
  )
}

function fetchFalso(responder: () => Response | Promise<Response>) {
  const chamadas: Chamada[] = []
  const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} })
    return responder()
  }) as typeof globalThis.fetch
  return { fetch, chamadas }
}

function corpoEnviado(chamada: Chamada): Record<string, unknown> {
  return JSON.parse(String(chamada.init.body)) as Record<string, unknown>
}

async function erroDe(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (err) {
    lancadas.push(err)
    return err
  }
  throw new Error('era esperado um erro')
}

describe('chamarClaude', () => {
  afterAll(() => {
    expect(lancadas.length).toBeGreaterThan(0)
    for (const err of lancadas) {
      expect(String((err as Error).message)).not.toContain('SENTINELA')
    }
  })

  it.each([undefined, ''])(
    'apiKey %j lança ClaudeDesligado sem chamar o fetch',
    async (apiKey) => {
      const { fetch, chamadas } = fetchFalso(() => respostaOk())
      const err = await erroDe(chamarClaude(apiKey, PEDIDO, { fetch }))
      expect(err).toBeInstanceOf(ClaudeDesligado)
      expect(chamadas).toHaveLength(0)
    },
  )

  it('200 devolve o texto trimado e o custo calculado do usage', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaOk())
    const r = await chamarClaude(SENTINELA, PEDIDO, { fetch })
    expect(r.texto).toBe('oi')
    expect(r.uso.input_tokens).toBe(1000)
    expect(r.uso.output_tokens).toBe(200)
    expect(r.custoMicro).toBe(
      custoMicroUsd('claude-haiku-5-5', {
        input_tokens: 1000,
        output_tokens: 200,
      }),
    )
    expect(r.custoMicro).toBe(200)
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].url).toBe('https://api.anthropic.com/v1/messages')
  })

  it('junta só os blocos de texto, ignorando thinking', async () => {
    const { fetch } = fetchFalso(() =>
      respostaOk({
        content: [
          { type: 'thinking', thinking: 'pensando', signature: 'x' },
          { type: 'text', text: 'parte 1 ' },
          { type: 'text', text: 'parte 2' },
        ],
      }),
    )
    const r = await chamarClaude(SENTINELA, PEDIDO, { fetch })
    expect(r.texto).toBe('parte 1 parte 2')
  })

  it('envia modelo, system como string, user e max_tokens, sem amostragem nem thinking', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaOk())
    await chamarClaude(SENTINELA, PEDIDO, { fetch })
    const corpo = corpoEnviado(chamadas[0])
    expect(corpo).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 100,
      system: 'Você revisa textos.',
      messages: [{ role: 'user', content: 'Olá, mundo.' }],
    })
    for (const campo of ['temperature', 'top_p', 'top_k', 'thinking']) {
      expect(corpo).not.toHaveProperty(campo)
    }
    expect(corpo).not.toHaveProperty('output_config')
  })

  it('com formatoJson, envia output_config.format json_schema', async () => {
    const schema = {
      type: 'object',
      properties: { tldr: { type: 'string' } },
      required: ['tldr'],
      additionalProperties: false,
    }
    const { fetch, chamadas } = fetchFalso(() =>
      respostaOk({ content: [{ type: 'text', text: '{"tldr":"x"}' }] }),
    )
    const r = await chamarClaude(
      SENTINELA,
      { ...PEDIDO, formatoJson: schema },
      { fetch },
    )
    expect(corpoEnviado(chamadas[0]).output_config).toEqual({
      format: { type: 'json_schema', schema },
    })
    expect(r.texto).toBe('{"tldr":"x"}')
  })

  it.each([
    [401, 'authentication_error', 'chave_invalida'],
    [403, 'permission_error', 'chave_invalida'],
    [400, 'invalid_request_error', 'requisicao_invalida'],
    [404, 'not_found_error', 'requisicao_invalida'],
    [413, 'request_too_large', 'requisicao_invalida'],
  ] as const)(
    'status %i vira ClaudeRecusou{%s → %s}',
    async (status, tipo, motivo) => {
      const { fetch, chamadas } = fetchFalso(() => respostaErro(status, tipo))
      const err = await erroDe(chamarClaude(SENTINELA, PEDIDO, { fetch }))
      expect(err).toBeInstanceOf(ClaudeRecusou)
      expect((err as ClaudeRecusou).motivo).toBe(motivo)
      expect((err as ClaudeRecusou).status).toBe(status)
      expect(chamadas).toHaveLength(1)
    },
  )

  it.each([
    [529, 'overloaded_error'],
    [500, 'api_error'],
    [429, 'rate_limit_error'],
  ] as const)(
    'status %i vira ClaudeIndisponivel, com um retry só',
    async (status, tipo) => {
      const { fetch, chamadas } = fetchFalso(() => respostaErro(status, tipo))
      const err = await erroDe(chamarClaude(SENTINELA, PEDIDO, { fetch }))
      expect(err).toBeInstanceOf(ClaudeIndisponivel)
      expect((err as ClaudeIndisponivel).status).toBe(status)
      expect(chamadas).toHaveLength(2)
    },
  )

  it('fetch lançando TypeError vira ClaudeIndisponivel', async () => {
    const { fetch } = fetchFalso(() => {
      throw new TypeError(`fetch failed (${SENTINELA})`)
    })
    const err = await erroDe(chamarClaude(SENTINELA, PEDIDO, { fetch }))
    expect(err).toBeInstanceOf(ClaudeIndisponivel)
    expect((err as ClaudeIndisponivel).status).toBeUndefined()
  })

  it.each([
    [{ stop_reason: 'refusal' }, 'recusa'],
    [{ stop_reason: 'max_tokens' }, 'formato'],
    [{ stop_reason: 'model_context_window_exceeded' }, 'formato'],
    [{ content: [{ type: 'text', text: '   \n ' }] }, 'formato'],
    [{ content: [] }, 'formato'],
  ] as const)('resposta %j vira ClaudeRecusou{%s}', async (extra, motivo) => {
    const { fetch } = fetchFalso(() => respostaOk(extra))
    const err = await erroDe(chamarClaude(SENTINELA, PEDIDO, { fetch }))
    expect(err).toBeInstanceOf(ClaudeRecusou)
    expect((err as ClaudeRecusou).motivo).toBe(motivo)
  })

  // A SDK 1.1.0 manda a apiKey como `Authorization: Bearer`, não `x-api-key`.
  it('a chave vai só no header authorization, nunca no corpo', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaOk())
    await chamarClaude(SENTINELA, PEDIDO, { fetch })
    const headers = new Headers(chamadas[0].init.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${SENTINELA}`)
    expect(headers.get('x-api-key')).toBeNull()
    expect(String(chamadas[0].init.body)).not.toContain('SENTINELA')
  })

  describe('com ANTHROPIC_BASE_URL e ANTHROPIC_AUTH_TOKEN no ambiente', () => {
    const antes = {
      base: process.env.ANTHROPIC_BASE_URL,
      token: process.env.ANTHROPIC_AUTH_TOKEN,
    }
    beforeEach(() => {
      process.env.ANTHROPIC_BASE_URL = 'https://atacante.example'
      process.env.ANTHROPIC_AUTH_TOKEN = 'token-do-ambiente'
    })
    afterEach(() => {
      for (const [nome, valor] of [
        ['ANTHROPIC_BASE_URL', antes.base],
        ['ANTHROPIC_AUTH_TOKEN', antes.token],
      ] as const) {
        if (valor === undefined) delete process.env[nome]
        else process.env[nome] = valor
      }
    })

    it('a chave só sai para api.anthropic.com e o token do ambiente é ignorado', async () => {
      const { fetch, chamadas } = fetchFalso(() => respostaOk())
      await chamarClaude(SENTINELA, PEDIDO, { fetch })
      expect(new URL(chamadas[0].url).origin).toBe('https://api.anthropic.com')
      const headers = new Headers(chamadas[0].init.headers)
      expect(headers.get('authorization')).toBe(`Bearer ${SENTINELA}`)
    })
  })
})
