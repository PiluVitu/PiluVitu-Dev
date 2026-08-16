/**
 * ⚠️ Nenhum teste deste arquivo toca a rede, o promeia ou o Ollama — o
 * `fetch` é sempre INJETADO (`opts.fetchImpl`).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  chamarPromeia,
  MSG_INALCANCAVEL,
  PromeiaDemorou,
  PromeiaInalcancavel,
  PromeiaRecusou,
  PromeiaRespostaIlegivel,
  promeiaConfigurado,
} from './promeia'

// ⚠️ Marcador improvável: `not.toContain('token')` casaria com qualquer texto
// que mencione a palavra — asserção negativa só vale com um valor que não
// apareceria por acaso.
const TOKEN_MARCADOR = 'TOKEN-PROMEIA-NAO-PODE-VAZAR-4b7e'
const CFG = { baseUrl: 'https://promeia.exemplo.test', token: TOKEN_MARCADOR }

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fetchFake(responder: () => Response | Promise<Response>) {
  return vi.fn(async () => responder()) as unknown as typeof fetch
}

describe('chamarPromeia — caminho feliz', () => {
  it('devolve o `data` do corpo', async () => {
    const data = await chamarPromeia<{ texto: string }>(
      '/insight',
      { competence: '2026-07' },
      CFG,
      {
        fetchImpl: fetchFake(() =>
          respostaJson(200, { ok: true, data: { texto: 'leitura' } }),
        ),
      },
    )
    expect(data).toEqual({ texto: 'leitura' })
  })

  it('manda o token no Authorization e o corpo em JSON', async () => {
    const impl = vi.fn(async () => respostaJson(200, { ok: true, data: {} }))
    await chamarPromeia('/insight', { competence: '2026-07' }, CFG, {
      fetchImpl: impl as unknown as typeof fetch,
    })
    const [url, init] = impl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://promeia.exemplo.test/insight')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN_MARCADOR}`,
    )
    expect(JSON.parse(init.body as string)).toEqual({ competence: '2026-07' })
  })

  it('não duplica a barra quando a baseUrl termina em /', async () => {
    const impl = vi.fn(async () => respostaJson(200, { ok: true, data: {} }))
    await chamarPromeia(
      '/insight',
      {},
      { ...CFG, baseUrl: 'https://promeia.exemplo.test/' },
      { fetchImpl: impl as unknown as typeof fetch },
    )
    const [url] = impl.mock.calls[0] as unknown as [string]
    expect(url).toBe('https://promeia.exemplo.test/insight')
  })
})

describe('chamarPromeia — os QUATRO desfechos, que mandam o dono a lados diferentes', () => {
  it('fetch que rejeita vira INALCANÇÁVEL, com a frase de subir o serviço', async () => {
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: (() => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
    expect((erro as Error).message).toBe(MSG_INALCANCAVEL)
  })

  it('a janela curta estourando vira DEMOROU, NUNCA inalcançável', async () => {
    // ⚠️ A distinção que este teste trava é a razão de `PromeiaDemorou`
    // existir: geração de insight leva 20,3-32,8 s medidos, então estourar a
    // janela de 8 s é o CAMINHO NORMAL. Classificá-la como inalcançável
    // (o que o original do ramielle faz, ver lib/promeia.ts) diria "suba o
    // promeia no Mac" toda vez que ele funcionasse.
    const impl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('abortado', 'AbortError')),
        )
      })) as unknown as typeof fetch

    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: impl,
      timeoutMs: 10,
    }).catch((e) => e)

    expect(erro).toBeInstanceOf(PromeiaDemorou)
    expect(erro).not.toBeInstanceOf(PromeiaInalcancavel)
    expect((erro as PromeiaDemorou).timeoutMs).toBe(10)
  })

  it('erro do promeia com code+message vira RECUSOU, repassando os dois', async () => {
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: fetchFake(() =>
        respostaJson(503, {
          ok: false,
          code: 'ollama_unreachable',
          message:
            'não consegui conectar ao Ollama — inicie com `ollama serve`',
        }),
      ),
    }).catch((e) => e)

    expect(erro).toBeInstanceOf(PromeiaRecusou)
    expect((erro as PromeiaRecusou).code).toBe('ollama_unreachable')
    expect((erro as PromeiaRecusou).status).toBe(503)
    expect((erro as PromeiaRecusou).message).toContain('ollama serve')
  })

  // ⚠️ O CASO MEDIDO NA SPIKE, e a razão desta classe existir: a Cloudflare
  // SUBSTITUI o corpo de um 502 da origem pelo próprio error page
  // (`text/plain`, 16 bytes). Determinístico, 3/3 de cada lado; 500 e 503
  // passam intactos, só o 502 é comido. A regra do ramielle ("erro sem
  // code/message ⇒ inalcançável") diria aqui "suba o promeia no Mac" com o
  // promeia DE PÉ — a pior mensagem possível, porque manda arrumar o que
  // está certo.
  it('502 com o corpo comido pelo túnel vira ILEGÍVEL, nunca INALCANÇÁVEL', async () => {
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: fetchFake(
        () =>
          new Response('error code: 502', {
            status: 502,
            headers: { 'content-type': 'text/plain' },
          }),
      ),
    }).catch((e) => e)

    expect(erro).toBeInstanceOf(PromeiaRespostaIlegivel)
    expect(erro).not.toBeInstanceOf(PromeiaInalcancavel)
    expect((erro as PromeiaRespostaIlegivel).status).toBe(502)
    expect((erro as PromeiaRespostaIlegivel).amostra).toBe('error code: 502')
  })

  it('um 5xx com JSON que não é o shape do promeia também vira ILEGÍVEL', async () => {
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: fetchFake(() => respostaJson(500, { erro: 'algo genérico' })),
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaRespostaIlegivel)
  })

  it('túnel caído (530, HTML) vira INALCANÇÁVEL — a faixa 520-527/530 é a ÚNICA evidência de ausência por status', async () => {
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: fetchFake(
        () =>
          new Response('<html><body>530</body></html>', {
            status: 530,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
    expect(erro).not.toBeInstanceOf(PromeiaRespostaIlegivel)
  })

  it('524 sem corpo vira INALCANÇÁVEL (mesma faixa), não ILEGÍVEL', async () => {
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: fetchFake(() => new Response('', { status: 524 })),
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
  })

  it('status da faixa Cloudflare VENCE mesmo com um corpo que parece do promeia', async () => {
    // Nunca acontece na prática (o promeia não emite esses status por
    // contrato, e a Cloudflare não fala o shape dele) — testado isolado pra
    // que um refactor que troque a ordem/o operador dessa checagem seja
    // acusado por algum teste.
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: fetchFake(() =>
        respostaJson(524, {
          ok: false,
          code: 'ollama_failed',
          message: 'o Ollama respondeu e falhou',
        }),
      ),
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaInalcancavel)
  })

  it('200 com corpo não-JSON vira ILEGÍVEL, não estoura', async () => {
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: fetchFake(() => new Response('nao e json', { status: 200 })),
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaRespostaIlegivel)
  })

  it('200 com um JSON que não é objeto (`5`) vira ILEGÍVEL, não estoura ao ler `.code`', async () => {
    const erro = await chamarPromeia('/insight', {}, CFG, {
      fetchImpl: fetchFake(() => new Response('5', { status: 200 })),
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(PromeiaRespostaIlegivel)
  })

  it('as quatro são classes DIFERENTES — nunca a mesma frase', async () => {
    // Compara INSTÂNCIAS (não `A.prototype instanceof B`, que é `false` pra
    // qualquer par de classes independentes e não provaria nada).
    const inalcancavel = new PromeiaInalcancavel()
    const demorou = new PromeiaDemorou(8000)
    const recusou = new PromeiaRecusou('x', 'c', 503)
    const ilegivel = new PromeiaRespostaIlegivel(502, 'error code: 502')

    expect(inalcancavel).not.toBeInstanceOf(PromeiaDemorou)
    expect(inalcancavel).not.toBeInstanceOf(PromeiaRespostaIlegivel)
    expect(demorou).not.toBeInstanceOf(PromeiaInalcancavel)
    expect(recusou).not.toBeInstanceOf(PromeiaRespostaIlegivel)
    expect(ilegivel).not.toBeInstanceOf(PromeiaInalcancavel)
    expect(ilegivel).not.toBeInstanceOf(PromeiaRecusou)
  })
})

describe('o PROMEIA_TOKEN NUNCA vaza', () => {
  it('não aparece em mensagem/stack de nenhum dos desfechos de falha', async () => {
    const cenarios: Array<() => typeof fetch> = [
      () =>
        (() => {
          throw new TypeError(`fetch failed para ${TOKEN_MARCADOR}`)
        }) as unknown as typeof fetch,
      () =>
        fetchFake(() =>
          respostaJson(503, { ok: false, code: 'x', message: 'falhou' }),
        ),
      () => fetchFake(() => new Response('error code: 502', { status: 502 })),
      () => fetchFake(() => new Response('', { status: 530 })),
    ]

    for (const montar of cenarios) {
      const erro = await chamarPromeia('/insight', { x: 1 }, CFG, {
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
