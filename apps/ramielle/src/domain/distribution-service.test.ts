/**
 * Testes de `distribution-service.ts` — oráculo de paridade:
 * `apps/api/internal/distribution/service_test.go` (`fakeHooks`/`fakePub`).
 * Publishers falsos (nunca os adapters reais) + `globalThis.fetch` mockado
 * pro promeia (nunca a rede real) — mesmo padrão de `routes/atelier.test.ts`.
 */
import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { PromeiaInalcancavel, PromeiaRecusou } from '../lib/promeia'
import { publishBluesky } from '../lib/publishers/bluesky'
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

/**
 * Shim de `D1Database` pro teste de mutação do C1 (fix round 1, Critical):
 * intercepta SÓ o `UPDATE ... SET status = 'posted', remote_url = ...`
 * (`markDistributionTargetPosted`, `domain/distribution.ts`) e faz esse
 * `.run()` falhar `falhas` vezes antes de delegar pro D1 real. Todo o
 * resto (`prepare` de qualquer outro SQL) vai direto pro `db` real —
 * objeto plano com só `prepare` sobrescrito, nunca `Proxy`, porque as
 * funções deste domínio só chamam `db.prepare(...)` (nunca `.batch()`
 * nem outro método do binding).
 *
 * O substring de match (`"remote_url = ?, error = '', posted_at"`) é
 * exclusivo dessa query — o `UPDATE` do upsert também contém a substring
 * `status = 'posted'` (dentro do `CASE WHEN`), então casar só por essa
 * substring pegaria a query ERRADA.
 */
function criarShimQuebraMarkPosted(db: D1Database, falhas: number): D1Database {
  let restantes = falhas
  const prepareReal = db.prepare.bind(db)
  return {
    prepare(sql: string) {
      const stmt = prepareReal(sql)
      if (!sql.includes("remote_url = ?, error = '', posted_at")) return stmt
      const bindReal = stmt.bind.bind(stmt)
      return {
        bind: (...args: unknown[]) => {
          const bound = bindReal(...(args as []))
          const runReal = bound.run.bind(bound)
          return {
            run: async () => {
              if (restantes > 0) {
                restantes--
                throw new Error('D1_ERROR: disk I/O error')
              }
              return runReal()
            },
          } as unknown as D1PreparedStatement
        },
      } as unknown as D1PreparedStatement
    },
  } as unknown as D1Database
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

  it('manda o article certo e a lista de plataformas sociais pro promeia — M4 (fix round 1): array EXATO, não superset, e com um publisher de artigo na cena', async () => {
    const { pub: devto } = criarPublisherFalso('devto', 'article_crosspost')
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

    const targets = await buildDistributionProposals(
      DB,
      [devto, bluesky, mastodon],
      PROMEIA_CFG,
      'p2',
      ARTIGO,
      'corpo',
    )

    expect(chamadas).toHaveLength(1)
    const chamada = chamadas[0] as {
      url: string
      body: { platforms: string[] }
    }
    expect(chamada.url).toBe('https://promeia.exemplo.test/llm/hooks')
    // M4: array EXATO (ordenado) — `arrayContaining` aceitaria um superset
    // (ex.: 'devto' vazando pra dentro de `platforms`, o que seria um bug:
    // o artigo NÃO passa por hook nenhum).
    expect([...chamada.body.platforms].sort()).toEqual(['bluesky', 'mastodon'])
    expect(chamada.body).toMatchObject({
      article: {
        title: 'T',
        excerpt: 'e',
        url: 'https://blog/p',
        tags: ['go'],
        voice_sample: 'trecho de referência',
      },
    })
    // e o publisher de artigo continua gerando o alvo dele, sem passar
    // pelo promeia.
    expect(targets.find((t) => t.platform === 'devto')?.kind).toBe(
      'article_crosspost',
    )
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

  // ⚠️ I1 (fix round 1) — a versão anterior deste teste usava
  // `promeiaCfg: null` com um devtoV1 SOCIAL: nesse caso o ramo social é
  // pulado inteiro (`promeiaCfg === null`), então o resultado (1 alvo, do
  // devtoV2 artigo) seria IDÊNTICO com ou sem dedup — removendo a dedup
  // inteira (`pubsUnicos = pubs`), a suíte continuava 100% verde. Corrigido
  // com `promeiaCfg` CONFIGURADO (o ramo social de fato executa) e as duas
  // ORDENS testadas, provando que quem sobrevive é o ÚLTIMO da lista, não
  // o primeiro (um `.find()` no lugar do `Map` também passaria pela versão
  // antiga do teste).
  it('dedup por platform (I1, fix round 1): social por ÚLTIMO vence — o artigo NÃO aparece, e o promeia É chamado pra essa plataforma', async () => {
    const { pub: devtoArtigo } = criarPublisherFalso(
      'devto',
      'article_crosspost',
    )
    const { pub: devtoSocial } = criarPublisherFalso('devto', 'social_hook')
    const chamadas = mockarPromeia(() =>
      jsonResponse(200, {
        ok: true,
        data: { hooks: [{ platform: 'devto', text: 'hook-devto' }] },
      }),
    )

    const targets = await buildDistributionProposals(
      DB,
      [devtoArtigo, devtoSocial], // social por ÚLTIMO
      PROMEIA_CFG,
      'p8a',
      ARTIGO,
      'corpo',
    )

    expect(chamadas).toHaveLength(1) // o promeia FOI chamado pra 'devto'
    expect(targets).toHaveLength(1)
    expect(targets[0]?.kind).toBe('social_hook')
    expect(targets[0]?.content).toBe('hook-devto')
  })

  it('dedup por platform (I1, fix round 1): artigo por ÚLTIMO vence — o social NÃO aparece, e o promeia NÃO é chamado pra essa plataforma', async () => {
    const { pub: devtoSocial } = criarPublisherFalso('devto', 'social_hook')
    const { pub: devtoArtigo } = criarPublisherFalso(
      'devto',
      'article_crosspost',
    )
    globalThis.fetch = (async () => {
      throw new Error(
        'fetch não deveria ser chamado — devto não é social depois do dedup',
      )
    }) as unknown as typeof fetch

    const targets = await buildDistributionProposals(
      DB,
      [devtoSocial, devtoArtigo], // artigo por ÚLTIMO
      PROMEIA_CFG,
      'p8b',
      ARTIGO,
      'corpo',
    )

    expect(targets).toHaveLength(1)
    expect(targets[0]?.kind).toBe('article_crosspost')
    expect(targets[0]?.content).toBe('corpo')
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
    // ⚠️ I2 (fix round 1) — sem esta linha, o teste passava mesmo se o
    // re-upsert PARASSE de reescrever `content`/`kind` (o único guard
    // observado era `posted`/`remote_url`, que não dependem do reset). O
    // que o reset faz de OBSERVÁVEL é gravar o texto EDITADO na UI — sem
    // isto, um refactor futuro publicaria o texto certo mas deixaria o
    // painel mostrando o rascunho antigo, em verde.
    expect(alvo?.content).toBe('edited')
  })

  // ⚠️ I1 (fix round 1) — o "último da lista vence" do dedup NUNCA tinha
  // teste aqui: um `.find()` (primeiro vence) no lugar do `Map` interno
  // (`pubsPorPlataforma`) passaria por todo o resto da suíte sem acusar
  // nada.
  it('dedup por platform (I1, fix round 1): dois publishers na mesma plataforma — o ÚLTIMO da lista é quem publica', async () => {
    const { pub: pubV1, chamadas: chamadasV1 } = criarPublisherFalso(
      'mastodon',
      'social_hook',
      { url: 'https://um' },
    )
    const { pub: pubV2, chamadas: chamadasV2 } = criarPublisherFalso(
      'mastodon',
      'social_hook',
      { url: 'https://dois' },
    )

    const out = await publishDistributionTargets(DB, [pubV1, pubV2], 'r2', [
      { platform: 'mastodon', content: 'x' },
    ])

    expect(chamadasV1()).toBe(0) // o primeiro NUNCA foi chamado
    expect(chamadasV2()).toBe(1) // só o ÚLTIMO foi
    expect(out.find((t) => t.platform === 'mastodon')?.remote_url).toBe(
      'https://dois',
    )
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

  // ⚠️ C1 (fix round 1, Critical) — o `markDistributionTargetPosted`
  // estava dentro do MESMO `try` de `pub.publish`, e uma falha de ESCRITA
  // no D1 (não de publicação — o publish já tinha retornado sucesso) caía
  // no mesmo `catch` e virava `MarkFailed`. Consequência: post JÁ EXISTIA
  // na plataforma, alvo saía `'failed'`, `remote_url` perdida, e a PRÓXIMA
  // publicação republicava — post DUPLICADO (nenhuma das 4 plataformas
  // dedupa do lado delas).
  describe('C1 (fix round 1) — falha de ESCRITA ao marcar posted nunca pode rebaixar o alvo', () => {
    it('1ª tentativa de marcar posted falha (transitória): retenta e recupera — resultado final é UMA publicação só, mesmo numa segunda tentativa do admin', async () => {
      const { pub, chamadas } = criarPublisherFalso('mastodon', 'social_hook', {
        url: 'https://m/recuperado',
      })
      // falha só a 1ª chamada de `SET status = 'posted'`; a 2ª (o retry
      // interno de `marcarPostadoComRetry`) usa o D1 real.
      const dbComFalhaTransitoria = criarShimQuebraMarkPosted(DB, 1)

      await upsertDistributionTarget(DB, {
        slug: 'c1a',
        platform: 'mastodon',
        kind: 'social_hook',
        content: 'oi',
        status: 'pending',
      })
      const sel: Selected[] = [{ platform: 'mastodon', content: 'oi editado' }]

      // 1ª "tentativa" — o request original do admin.
      const out1 = await publishDistributionTargets(
        dbComFalhaTransitoria,
        [pub],
        'c1a',
        sel,
      )
      expect(chamadas()).toBe(1) // pub.publish só foi chamado 1 vez
      const alvo1 = out1.find((t) => t.platform === 'mastodon')
      expect(alvo1?.status).toBe('posted') // NUNCA caiu pra failed/pending
      expect(alvo1?.remote_url).toBe('https://m/recuperado') // o retry recuperou a URL real

      // 2ª "tentativa" — o admin, sem saber que já funcionou, publica de
      // novo (D1 real desta vez, sem o shim — irrelevante, o alvo já está
      // 'posted').
      const out2 = await publishDistributionTargets(DB, [pub], 'c1a', sel)
      expect(chamadas()).toBe(1) // NÃO publicou de novo — sem isso, seria 2
      const alvo2 = out2.find((t) => t.platform === 'mastodon')
      expect(alvo2?.status).toBe('posted')
      expect(alvo2?.remote_url).toBe('https://m/recuperado')
    })

    it('as DUAS tentativas com a URL real falham: grava posted com remote_url vazia — nunca rebaixa, nunca guarda texto cru de infra em `error`', async () => {
      const { pub, chamadas } = criarPublisherFalso('bluesky', 'social_hook', {
        url: 'https://bsky/nao-sera-gravada',
      })
      const dbSempreFalha = criarShimQuebraMarkPosted(DB, 2)

      const out = await publishDistributionTargets(
        dbSempreFalha,
        [pub],
        'c1b',
        [{ platform: 'bluesky', content: 'x' }],
      )

      expect(chamadas()).toBe(1) // publish só é chamado 1 vez — já aconteceu
      const alvo = out.find((t) => t.platform === 'bluesky')
      expect(alvo?.status).toBe('posted') // selo preservado, nunca failed/pending
      expect(alvo?.remote_url).toBe('') // URL perdida (aceitável)
      expect(alvo?.error ?? '').not.toContain('D1_ERROR') // (c) nunca texto cru
      expect(alvo?.error ?? '').not.toContain('disk I/O')
    })
  })
})

// ⚠️ A1 (revisão final da fatia) — `Payload.text` (`text: sel.content`,
// `publishDistributionTargets`) era o ÚNICO campo do caminho de publicação
// sem NENHUMA asserção de valor na suíte inteira: mutar pra `text: ''` e
// rodar a suíte inteira do Worker deixava os 559 testes verdes (reproduzido
// 4×), enquanto o mesmo experimento em `bodyMd`/`title`/`canonicalUrl`/
// `description`/`tags` (os 5 campos do caminho de ARTIGO) é morto por
// `routes/distribution.test.ts:542`. O `text` não tinha par: `Payload` é
// montado pelo SERVIÇO (`domain/distribution-service.ts:357-364`), mas todo
// teste existente que provava `record.text` (`lib/publishers/bluesky.test.ts`)
// recebia um `Payload` já pronto NA MÃO do teste — nunca o que o serviço
// monta a partir de `sel.content` — e o único teste de rota que exercita
// Bluesky/Mastodon usa um mock que responde 500 sem ler o corpo enviado.
//
// Este teste fecha a lacuna chamando o `publishBluesky` DE VERDADE (não um
// publisher falso) através de `publishDistributionTargets`, e afirma que o
// `record.text` que de fato chega no `createRecord` do Bluesky é
// EXATAMENTE `sel.content` — o único jeito de provar que `text: sel.content`
// sobrevive do domínio até o corpo real enviado à plataforma.
describe('publishDistributionTargets — A1: Payload.text chega ao texto REAL enviado à plataforma (via publishBluesky de verdade, não um Payload montado à mão)', () => {
  const BLUESKY_BASE_A1 = 'https://bluesky-a1.exemplo.test'

  it("o content do Selected é EXATAMENTE o texto que o Bluesky recebe no createRecord — prova por mutação (text: sel.content → text: '')", async () => {
    let corpoCreateRecord: { record?: { text?: string } } | undefined
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const urlTexto = String(url)
      if (!urlTexto.startsWith(BLUESKY_BASE_A1)) {
        throw new Error(`URL não mockada: ${urlTexto}`)
      }
      if (urlTexto.endsWith('createSession')) {
        return jsonResponse(200, { accessJwt: 'JWT', did: 'did:plc:a1' })
      }
      if (urlTexto.endsWith('createRecord')) {
        corpoCreateRecord = JSON.parse(init?.body as string)
        return jsonResponse(200, {
          uri: 'at://did:plc:a1/app.bsky.feed.post/rkey-a1',
          cid: 'cid-a1',
        })
      }
      throw new Error(`URL não mockada: ${urlTexto}`)
    }) as unknown as typeof fetch

    // Publisher REAL (não `criarPublisherFalso`) — a única forma de provar
    // que o `Payload` MONTADO PELO SERVIÇO (não um `Payload` escrito à mão
    // no teste) chega intacto até o adapter.
    const pubBlueskyReal: Publisher = {
      platform: 'bluesky',
      kind: 'social_hook',
      publish: (payload) =>
        publishBluesky(
          {
            handle: 'dono.bsky.social',
            appPassword: 'pw',
            baseUrl: BLUESKY_BASE_A1,
          },
          payload,
        ),
    }

    await publishDistributionTargets(DB, [pubBlueskyReal], 'a1-texto-real', [
      { platform: 'bluesky', content: 'texto do domínio, sem intermediário' },
    ])

    expect(corpoCreateRecord?.record?.text).toBe(
      'texto do domínio, sem intermediário',
    )
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
