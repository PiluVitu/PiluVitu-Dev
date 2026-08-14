/**
 * Testes de `distribution-service.ts` — oráculo de paridade:
 * `apps/api/internal/distribution/service_test.go` (`fakeHooks`/`fakePub`).
 * Publishers falsos (nunca os adapters reais) + `globalThis.fetch` mockado
 * pro promeia (nunca a rede real) — mesmo padrão de `routes/atelier.test.ts`.
 */
import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { PromeiaInalcancavel, PromeiaRecusou } from '../lib/promeia'
import type { DistributionKind } from './distribution'
import {
  listDistributionTargetsBySlug,
  upsertDistributionTarget,
} from './distribution'
import {
  buildDistributionProposals,
  listDistributionProposals,
  publishDistributionTargets,
  type Article,
  type Publisher,
  type Selected,
} from './distribution-service'

const DB = env.DB
const PROMEIA_CFG = { baseUrl: 'https://promeia.exemplo.test', token: 'tok' }

const ARTIGO: Article = {
  title: 'T',
  excerpt: 'e',
  url: 'https://blog/p',
  tags: ['go'],
  voiceSample: 'trecho de referência',
}

function jsonResponse(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

/** Mocka só a URL do promeia — qualquer outra URL lança (nunca rede real). */
function mockarPromeia(responder: () => Response | Promise<Response>) {
  const chamadas: unknown[] = []
  globalThis.fetch = (async (url: string) => {
    if (String(url).startsWith(PROMEIA_CFG.baseUrl)) {
      chamadas.push(url)
      return responder()
    }
    throw new Error(`URL não mockada: ${url}`)
  }) as unknown as typeof fetch
  return chamadas
}

/** Publisher falso — porte de `fakePub` (service_test.go:50-62). */
function criarPublisherFalso(
  platform: Publisher['platform'],
  kind: DistributionKind,
  opts: { url?: string; falhar?: boolean } = {},
): { pub: Publisher; chamadas: () => number } {
  let n = 0
  const pub: Publisher = {
    platform,
    kind,
    publish: async () => {
      n++
      if (opts.falhar) throw new Error('boom')
      return opts.url ?? `https://exemplo.test/${platform}/1`
    },
  }
  return { pub, chamadas: () => n }
}

describe('buildDistributionProposals', () => {
  it('monta artigos + hooks sociais via promeia e persiste tudo — porte de TestBuildProposals (service_test.go:20-48)', async () => {
    const { pub: devto } = criarPublisherFalso('devto', 'article_crosspost')
    const { pub: bluesky } = criarPublisherFalso('bluesky', 'social_hook')
    mockarPromeia(() =>
      jsonResponse(200, {
        ok: true,
        data: { hooks: [{ platform: 'bluesky', text: 'hook-bluesky' }] },
      }),
    )

    const targets = await buildDistributionProposals(
      DB,
      [devto, bluesky],
      PROMEIA_CFG,
      'p',
      ARTIGO,
      'corpo do artigo',
    )

    expect(targets).toHaveLength(2)
    const byPlat = Object.fromEntries(targets.map((t) => [t.platform, t]))
    expect(byPlat.devto?.content).toBe('corpo do artigo')
    expect(byPlat.devto?.kind).toBe('article_crosspost')
    expect(byPlat.bluesky?.content).toBe('hook-bluesky')
    expect(byPlat.bluesky?.kind).toBe('social_hook')

    // persistiu?
    const stored = await listDistributionTargetsBySlug(DB, 'p')
    expect(stored).toHaveLength(2)
  })

  it('manda o article certo e a lista de plataformas sociais pro promeia', async () => {
    const { pub: bluesky } = criarPublisherFalso('bluesky', 'social_hook')
    const { pub: mastodon } = criarPublisherFalso('mastodon', 'social_hook')
    const chamadas: unknown[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, body: JSON.parse(init.body as string) })
      return jsonResponse(200, {
        ok: true,
        data: {
          hooks: [
            { platform: 'bluesky', text: 'hb' },
            { platform: 'mastodon', text: 'hm' },
          ],
        },
      })
    }) as unknown as typeof fetch

    await buildDistributionProposals(
      DB,
      [bluesky, mastodon],
      PROMEIA_CFG,
      'p2',
      ARTIGO,
      'corpo',
    )

    expect(chamadas).toHaveLength(1)
    const chamada = chamadas[0] as { url: string; body: unknown }
    expect(chamada.url).toBe('https://promeia.exemplo.test/llm/hooks')
    expect(chamada.body).toEqual({
      article: {
        title: 'T',
        excerpt: 'e',
        url: 'https://blog/p',
        tags: ['go'],
        voice_sample: 'trecho de referência',
      },
      platforms: expect.arrayContaining(['bluesky', 'mastodon']),
    })
  })

  it('gerador NÃO configurado (promeiaCfg null) pula os sociais em SILÊNCIO — devolve só os artigos, sem erro (acréscimo do coordenador)', async () => {
    const { pub: devto } = criarPublisherFalso('devto', 'article_crosspost')
    const { pub: bluesky } = criarPublisherFalso('bluesky', 'social_hook')
    // Se o fetch fosse chamado, este teste acusaria — prova que o promeia
    // NUNCA é alcançado quando o gerador não está configurado.
    globalThis.fetch = (async () => {
      throw new Error('fetch não deveria ser chamado')
    }) as unknown as typeof fetch

    const targets = await buildDistributionProposals(
      DB,
      [devto, bluesky],
      null,
      'p3',
      ARTIGO,
      'corpo',
    )

    expect(targets).toHaveLength(1)
    expect(targets[0]?.platform).toBe('devto')

    const stored = await listDistributionTargetsBySlug(DB, 'p3')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.platform).toBe('devto')
  })

  it('gerador configurado mas INALCANÇÁVEL derruba o buildProposals inteiro — nada é persistido, nem os artigos já montados em memória (acréscimo do coordenador)', async () => {
    const { pub: devto } = criarPublisherFalso('devto', 'article_crosspost')
    const { pub: bluesky } = criarPublisherFalso('bluesky', 'social_hook')
    mockarPromeia(() => {
      throw new TypeError('fetch failed')
    })

    await expect(
      buildDistributionProposals(
        DB,
        [devto, bluesky],
        PROMEIA_CFG,
        'p4',
        ARTIGO,
        'corpo',
      ),
    ).rejects.toBeInstanceOf(PromeiaInalcancavel)

    const stored = await listDistributionTargetsBySlug(DB, 'p4')
    expect(stored).toEqual([])
  })

  it('gerador configurado mas RECUSA (Ollama sem o modelo) também derruba o buildProposals inteiro — nada persiste', async () => {
    const { pub: devto } = criarPublisherFalso('devto', 'article_crosspost')
    const { pub: bluesky } = criarPublisherFalso('bluesky', 'social_hook')
    mockarPromeia(() =>
      jsonResponse(503, {
        ok: false,
        code: 'ollama_model_missing',
        message: "modelo 'qwen' não instalado",
      }),
    )

    const erro = await buildDistributionProposals(
      DB,
      [devto, bluesky],
      PROMEIA_CFG,
      'p5',
      ARTIGO,
      'corpo',
    ).catch((e) => e)

    expect(erro).toBeInstanceOf(PromeiaRecusou)
    expect((erro as PromeiaRecusou).code).toBe('ollama_model_missing')

    const stored = await listDistributionTargetsBySlug(DB, 'p5')
    expect(stored).toEqual([])
  })

  it('sem publisher social nenhum, o promeia NUNCA é chamado mesmo com promeiaCfg configurado', async () => {
    const { pub: devto } = criarPublisherFalso('devto', 'article_crosspost')
    globalThis.fetch = (async () => {
      throw new Error('fetch não deveria ser chamado')
    }) as unknown as typeof fetch

    const targets = await buildDistributionProposals(
      DB,
      [devto],
      PROMEIA_CFG,
      'p6',
      ARTIGO,
      'corpo',
    )
    expect(targets).toHaveLength(1)
  })

  it('devolve status "pending" SEMPRE, mesmo pra alvo já posted no banco — não relê (armadilha 5)', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'p7',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'antigo',
      status: 'posted',
    })

    const { pub: devto } = criarPublisherFalso('devto', 'article_crosspost')
    const targets = await buildDistributionProposals(
      DB,
      [devto],
      null,
      'p7',
      ARTIGO,
      'novo corpo',
    )

    // devolvido: sempre pending, mesmo o alvo já estando posted no banco.
    expect(targets[0]?.status).toBe('pending')

    // banco: o CASE WHEN do upsert preserva o status real (posted).
    const stored = await listDistributionTargetsBySlug(DB, 'p7')
    expect(stored[0]?.status).toBe('posted')
    expect(stored[0]?.content).toBe('novo corpo')
  })

  it('dedup por platform: dois publishers com a mesma plataforma — o ÚLTIMO da lista vence', async () => {
    const { pub: devtoV1 } = criarPublisherFalso('devto', 'social_hook')
    const { pub: devtoV2 } = criarPublisherFalso('devto', 'article_crosspost')

    const targets = await buildDistributionProposals(
      DB,
      [devtoV1, devtoV2],
      null,
      'p8',
      ARTIGO,
      'corpo',
    )
    // só um alvo (mesma plataforma dedupada), com o kind do ÚLTIMO da lista.
    expect(targets).toHaveLength(1)
    expect(targets[0]?.kind).toBe('article_crosspost')
  })
})

describe('publishDistributionTargets', () => {
  it('marca posted e é idempotente — porte de TestPublishMarksPostedAndIsIdempotent (service_test.go:64-90)', async () => {
    const { pub, chamadas } = criarPublisherFalso('mastodon', 'social_hook', {
      url: 'https://m/1',
    })

    // alvo pré-existente pending
    await upsertDistributionTarget(DB, {
      slug: 'q',
      platform: 'mastodon',
      kind: 'social_hook',
      content: 'oi',
      status: 'pending',
    })

    const sel: Selected[] = [{ platform: 'mastodon', content: 'oi editado' }]
    const out = await publishDistributionTargets(DB, [pub], 'q', sel)
    expect(chamadas()).toBe(1)
    const alvo = out.find((t) => t.platform === 'mastodon')
    expect(alvo?.status).toBe('posted')
    expect(alvo?.remote_url).toBe('https://m/1')

    // segunda chamada NÃO reposta — armadilha 3, idempotência.
    // ⚠️ Este é o teste que a mutação obrigatória do Step 5 (fazer `publish`
    // NÃO pular alvos `posted`) tem que quebrar.
    await publishDistributionTargets(DB, [pub], 'q', sel)
    expect(chamadas()).toBe(1)
  })

  it('reseta failed → pending antes de retentar — porte de TestPublishRetriesFailedTarget (service_test.go:92-122)', async () => {
    const { pub, chamadas } = criarPublisherFalso('bluesky', 'social_hook', {
      url: 'https://bsky.app/retry',
    })

    await upsertDistributionTarget(DB, {
      slug: 'r',
      platform: 'bluesky',
      kind: 'social_hook',
      content: 'draft',
      status: 'pending',
    })
    // simula uma tentativa anterior que falhou
    await publishDistributionTargets(
      DB,
      [criarPublisherFalso('bluesky', 'social_hook', { falhar: true }).pub],
      'r',
      [{ platform: 'bluesky', content: 'draft' }],
    )
    const antes = await listDistributionTargetsBySlug(DB, 'r')
    expect(antes[0]?.status).toBe('failed')

    const out = await publishDistributionTargets(DB, [pub], 'r', [
      { platform: 'bluesky', content: 'edited' },
    ])
    expect(chamadas()).toBe(1)
    const alvo = out.find((t) => t.platform === 'bluesky')
    expect(alvo?.status).toBe('posted')
    expect(alvo?.remote_url).toBe('https://bsky.app/retry')
  })

  it('kind vem do publisher, NUNCA do cliente (armadilha 8)', async () => {
    const { pub } = criarPublisherFalso('mastodon', 'social_hook')
    // ⚠️ `Selected` não tem campo `kind` — um cliente malicioso/desatualizado
    // só consegue forçar isso via cast, exatamente o que este teste faz pra
    // provar que o valor é ignorado.
    const selecionadoComKindErrado = {
      platform: 'mastodon',
      content: 'oi',
      kind: 'article_crosspost',
    } as unknown as Selected

    await publishDistributionTargets(DB, [pub], 's', [selecionadoComKindErrado])

    const alvo = (await listDistributionTargetsBySlug(DB, 's'))[0]
    expect(alvo?.kind).toBe('social_hook') // do publisher, não do cliente
  })

  it('devolve o estado relido do BANCO, incluindo alvos que não foram selecionados desta vez', async () => {
    await upsertDistributionTarget(DB, {
      slug: 't',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'artigo',
      status: 'pending',
    })
    const { pub } = criarPublisherFalso('mastodon', 'social_hook')

    const out = await publishDistributionTargets(DB, [pub], 't', [
      { platform: 'mastodon', content: 'oi' },
    ])

    // devto não foi selecionado, mas continua aparecendo — veio do banco.
    expect(out.map((t) => t.platform).sort()).toEqual(['devto', 'mastodon'])
  })

  it('alvo cujo platform não tem publisher configurado é ignorado (continue), sem crash', async () => {
    const { pub } = criarPublisherFalso('mastodon', 'social_hook')
    const out = await publishDistributionTargets(DB, [pub], 'u', [
      { platform: 'twitter-nao-existe', content: 'x' },
    ])
    expect(out).toEqual([])
  })

  it('falha do publish marca failed com a mensagem do erro, sem derrubar os outros alvos selecionados', async () => {
    const { pub: falho } = criarPublisherFalso('bluesky', 'social_hook', {
      falhar: true,
    })
    const { pub: ok, chamadas } = criarPublisherFalso(
      'mastodon',
      'social_hook',
      { url: 'https://m/2' },
    )

    const out = await publishDistributionTargets(DB, [falho, ok], 'v', [
      { platform: 'bluesky', content: 'x' },
      { platform: 'mastodon', content: 'y' },
    ])

    expect(chamadas()).toBe(1) // mastodon foi tentado normalmente
    const bluesky = out.find((t) => t.platform === 'bluesky')
    const mastodon = out.find((t) => t.platform === 'mastodon')
    expect(bluesky?.status).toBe('failed')
    expect(bluesky?.error).toBe('boom')
    expect(mastodon?.status).toBe('posted')
    expect(mastodon?.remote_url).toBe('https://m/2')
  })
})

describe('listDistributionProposals', () => {
  it('devolve o mesmo que listDistributionTargetsBySlug — wrapper fino, porte de Service.List', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'w',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'x',
      status: 'pending',
    })
    const viaServico = await listDistributionProposals(DB, 'w')
    const viaDominio = await listDistributionTargetsBySlug(DB, 'w')
    expect(viaServico).toEqual(viaDominio)
  })

  it('devolve array vazio pra slug sem alvo nenhum', async () => {
    expect(await listDistributionProposals(DB, 'inexistente')).toEqual([])
  })
})
