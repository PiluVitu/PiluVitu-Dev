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
    // ⚠️ M5 (revisão): `A.prototype instanceof B` é `false` pra QUALQUER
    // duas classes que não estendem uma a outra — só falharia se uma
    // estendesse a outra por engano. Não prova nada sobre INSTÂNCIAS reais,
    // que é o que `traduzirFalha`/os testes de fato comparam. Comparar
    // instâncias de verdade.
    expect(new PromeiaInalcancavel('x')).not.toBeInstanceOf(PromeiaRecusou)
    expect(new PromeiaRecusou('x', 'c', 500)).not.toBeInstanceOf(
      PromeiaInalcancavel,
    )
  })

  // ⚠️ I2 (achado mais grave da revisão): este teste CONGELAVA como
  // "correto" exatamente o defeito que a §5 do spec existe para evitar. Um
  // erro HTTP sem corpo JSON reconhecível do promeia (`<html>502</html>` —
  // texto cru, não `{ok,code,message}`) é o formato que o TÚNEL CLOUDFLARE
  // devolve quando o Mac está desligado/travado, NUNCA o formato que o
  // próprio promeia devolve (toda rota dele SEMPRE inclui `code`+`message`
  // no erro — ver `_erro`/`TokenMiddleware` em revisao_rotas.py/auth.py). A
  // versão antiga classificava isso como "RECUSOU" (alcancei e ele
  // recusou) — a frase errada da §5, mandando o dono investigar um serviço
  // que nunca respondeu.
  it('erro HTTP SEM corpo reconhecível do promeia vira INALCANÇÁVEL — é a infraestrutura respondendo, não o promeia', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>502</html>', { status: 502 }),
    )
    const erro = await chamarPromeia('/llm/proofread', {}, CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
    expect((erro as PromeiaInalcancavel).message).toContain('Suba o promeia')
  })

  it('túnel Cloudflare caído (530, HTML) vira INALCANÇÁVEL, não RECUSOU — cenário medido pelo revisor com o app real', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html><body>530</body></html>', {
          status: 530,
          headers: { 'content-type': 'text/html' },
        }),
    )
    const erro = await chamarPromeia('/llm/proofread', {}, CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
    expect(erro).not.toBeInstanceOf(PromeiaRecusou)
  })

  it('túnel Cloudflare travado (524, sem corpo) vira INALCANÇÁVEL — mesmo cenário medido pelo revisor', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 524 }))
    const erro = await chamarPromeia('/llm/proofread', {}, CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
    expect(erro).not.toBeInstanceOf(PromeiaRecusou)
  })

  it('um 5xx com JSON que NÃO é o shape do promeia (sem code/message) também vira INALCANÇÁVEL, mesmo fora da lista de códigos Cloudflare', async () => {
    // A regra é sobre o CORPO, não só sobre os status codes conhecidos da
    // Cloudflare — um 500 genérico de qualquer proxy no meio do caminho
    // também não é o promeia respondendo.
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ erro: 'algo genérico' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const erro = await chamarPromeia('/llm/proofread', {}, CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
  })

  it('status na faixa Cloudflare VENCE mesmo com um corpo que parece do promeia — o promeia nunca emite esses status por contrato', async () => {
    // Nunca acontece na prática (promeia só emite 400/401/502/503 — ver
    // revisao_rotas.py/auth.py — e a Cloudflare não fala o shape do
    // promeia), mas a checagem de STATUS é deliberadamente autoritativa:
    // testar isto isolado evita que um refactor futuro troque o `||` por um
    // `&&` (fazendo a checagem de status parar de proteger nada) sem que
    // nenhum teste acuse.
    const fetchImpl = vi.fn(async () =>
      respostaJson(524, {
        ok: false,
        code: 'ollama_failed',
        message: 'o Ollama respondeu e falhou',
      }),
    )
    const erro = await chamarPromeia('/llm/proofread', {}, CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
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
