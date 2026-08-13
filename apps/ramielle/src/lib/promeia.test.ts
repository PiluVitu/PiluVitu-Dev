import { describe, expect, it, vi } from 'vitest'
import {
  chamarPromeia,
  PromeiaInalcancavel,
  PromeiaRecusou,
  promeiaConfigurado,
} from './promeia'

// ⚠️ Marcador improvável: `not.toContain('token')` casaria com qualquer texto
// que mencione a palavra. A lição da fatia ③ — asserção negativa só vale com
// um valor que não apareceria por acaso.
const TOKEN_MARCADOR = 'TOKEN-PROMEIA-NAO-PODE-VAZAR-9f3a'
const CFG = { baseUrl: 'https://promeia.exemplo.test', token: TOKEN_MARCADOR }

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('chamarPromeia — caminho feliz', () => {
  it('devolve o `data` do corpo', async () => {
    const fetchImpl = vi.fn(async () =>
      respostaJson(200, { ok: true, data: { corrected: 'texto' } }),
    )
    const data = await chamarPromeia<{ corrected: string }>(
      '/llm/proofread',
      { text: 'x' },
      CFG,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(data).toEqual({ corrected: 'texto' })
  })

  it('manda o token no Authorization e o corpo em JSON', async () => {
    const fetchImpl = vi.fn(async () =>
      respostaJson(200, { ok: true, data: {} }),
    )
    await chamarPromeia('/llm/refine', { text: 'x' }, CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://promeia.exemplo.test/llm/refine')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN_MARCADOR}`,
    )
    expect(JSON.parse(init.body as string)).toEqual({ text: 'x' })
  })

  it('não duplica a barra quando a baseUrl termina em /', async () => {
    const fetchImpl = vi.fn(async () =>
      respostaJson(200, { ok: true, data: {} }),
    )
    await chamarPromeia(
      '/llm/refine',
      {},
      { ...CFG, baseUrl: 'https://promeia.exemplo.test/' },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(url).toBe('https://promeia.exemplo.test/llm/refine')
  })
})

describe('chamarPromeia — os DOIS modos de falha (§5 do spec)', () => {
  it('fetch que rejeita vira INALCANÇÁVEL, com a frase de subir o Mac', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(
      chamarPromeia('/llm/proofread', {}, CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(PromeiaInalcancavel)
  })

  it('timeout vira INALCANÇÁVEL, não fica pendurado', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('abortado', 'AbortError')),
          )
        }),
    )
    await expect(
      chamarPromeia('/llm/proofread', {}, CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 10,
      }),
    ).rejects.toBeInstanceOf(PromeiaInalcancavel)
  })

  it('status de erro vira RECUSOU, repassando code e message do promeia', async () => {
    // É o ponto da §5: "alcancei e falhou" tem que DIZER isso. A mensagem do
    // promeia ("rode ollama pull X") é o que torna o erro acionável.
    const fetchImpl = vi.fn(async () =>
      respostaJson(503, {
        ok: false,
        code: 'ollama_model_missing',
        message: "modelo 'qwen' não está instalado. Instale: ollama pull qwen",
      }),
    )
    const erro = await chamarPromeia('/llm/proofread', {}, CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e) => e)

    expect(erro).toBeInstanceOf(PromeiaRecusou)
    expect((erro as PromeiaRecusou).code).toBe('ollama_model_missing')
    expect((erro as PromeiaRecusou).status).toBe(503)
    expect((erro as PromeiaRecusou).message).toContain('ollama pull qwen')
  })

  it('as duas falhas são classes DIFERENTES — nunca a mesma frase', async () => {
    // Colapsar as duas manda o dono subir algo que já está de pé.
    expect(PromeiaInalcancavel.prototype).not.toBeInstanceOf(PromeiaRecusou)
    expect(PromeiaRecusou.prototype).not.toBeInstanceOf(PromeiaInalcancavel)
  })

  it('erro sem corpo JSON ainda vira RECUSOU com mensagem própria', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>502</html>', { status: 502 }),
    )
    const erro = await chamarPromeia('/llm/proofread', {}, CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaRecusou)
    expect((erro as PromeiaRecusou).code).toBe('promeia_failed')
  })

  it('200 com corpo não-JSON vira RECUSOU, não estoura', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('nao e json', { status: 200 }),
    )
    await expect(
      chamarPromeia('/llm/proofread', {}, CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(PromeiaRecusou)
  })
})

describe('o PROMEIA_TOKEN NUNCA vaza', () => {
  it('não aparece em nenhuma mensagem de erro dos dois modos de falha', async () => {
    const cenarios: Array<() => typeof fetch> = [
      () =>
        (async () => {
          throw new TypeError('fetch failed')
        }) as unknown as typeof fetch,
      () =>
        (async () =>
          respostaJson(500, {
            ok: false,
            code: 'x',
            message: 'falhou',
          })) as unknown as typeof fetch,
      () =>
        (async () =>
          new Response('erro cru', { status: 502 })) as unknown as typeof fetch,
    ]

    for (const montar of cenarios) {
      const erro = await chamarPromeia('/llm/proofread', { text: 'x' }, CFG, {
        fetchImpl: montar(),
      }).catch((e) => e)
      const serializado = `${(erro as Error).message} ${(erro as Error).stack ?? ''}`
      expect(serializado).not.toContain(TOKEN_MARCADOR)
    }
  })
})

describe('promeiaConfigurado', () => {
  it('devolve null sem URL ou sem token — feature desligada, não quebrada', () => {
    expect(promeiaConfigurado({})).toBeNull()
    expect(promeiaConfigurado({ PROMEIA_URL: 'https://x' })).toBeNull()
    expect(promeiaConfigurado({ PROMEIA_TOKEN: 't' })).toBeNull()
    expect(
      promeiaConfigurado({ PROMEIA_URL: '', PROMEIA_TOKEN: 't' }),
    ).toBeNull()
  })

  it('devolve a config com as duas presentes', () => {
    expect(
      promeiaConfigurado({ PROMEIA_URL: 'https://x', PROMEIA_TOKEN: 't' }),
    ).toEqual({ baseUrl: 'https://x', token: 't' })
  })
})
