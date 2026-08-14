/**
 * Testes de `routes/distribution.ts` (Task 4, ÚLTIMA da fatia
 * `.superpowers/sdd/2026-08-13-ramielle-distribuicao/`) contra o app REAL
 * (`../index`) — mesmo padrão de `routes/atelier.test.ts`: cookie de
 * sessão genuíno via uma segunda instância `betterAuth()`
 * (`emailAndPassword`, técnica de teste — produção é só Google).
 *
 * ⚠️ **Nenhum teste chama plataforma real nem o promeia real.** `fetch`
 * global é substituído em todo teste que exercita rede — qualquer URL não
 * mockada lança, nunca cai no `fetch` original.
 */
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { afterEach, describe, expect, test } from 'vitest'
import app, { type Bindings } from '../index'
import {
  getDistributionTarget,
  upsertDistributionTarget,
} from '../domain/distribution'
import type { Envelope } from '../lib/envelope'
import { montarPublishers } from './distribution'

const DB = env.DB
const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)
const ADMIN = 'dono@exemplo.test'
const MARCADOR_DEVTO = 'MARCADOR-DEVTO-NAO-PODE-VAZAR-9f2a'
const MARCADOR_HASHNODE = 'MARCADOR-HASHNODE-NAO-PODE-VAZAR-3c7d'
const MARCADOR_BLUESKY = 'MARCADOR-BLUESKY-NAO-PODE-VAZAR-1e5b'
const MARCADOR_MASTODON = 'MARCADOR-MASTODON-NAO-PODE-VAZAR-8a4f'

function testEnv(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: ADMIN,
    ...extra,
  }
}

/** Env com o dev.to configurado — usado por toda rota que só precisa de UMA plataforma pra sair de 503. */
function envComDevto(extra: Partial<Bindings> = {}): Bindings {
  return testEnv({ DEVTO_API_KEY: MARCADOR_DEVTO, ...extra })
}

async function cookieDeAdmin(): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })
  const cadastro = await authDeTeste.api.signUpEmail({
    body: { email: ADMIN, password: 'senha-forte-123', name: 'Dono' },
    asResponse: true,
  })
  const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie')
  return cookie
}

// Conta autenticada, mas SEM privilégio de admin — a votação do ramielle é
// LIVRE, então esta é exatamente a conta que não deveria conseguir gerar
// propostas nem publicar em nome do dono. Mesmo padrão de
// `routes/atelier.test.ts#cookieDeNaoAdmin`.
async function cookieDeNaoAdmin(): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })
  const cadastro = await authDeTeste.api.signUpEmail({
    body: {
      email: 'distribution-naoadmin@exemplo.test',
      password: 'senha-forte-123',
      name: 'Não Admin',
    },
    asResponse: true,
  })
  const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie')
  return cookie
}

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

function jsonResponse(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Intercepta `fetch` por prefixo de URL — qualquer URL sem prefixo casando lança. */
function mockarFetch(
  interceptores: Array<{
    prefixo: string
    responder: () => Response | Promise<Response>
  }>,
) {
  const vistos: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const alvo = interceptores.find((i) => String(url).startsWith(i.prefixo))
    if (!alvo) throw new Error(`fetch chamado sem mock: ${url}`)
    vistos.push({ url: String(url), init })
    return alvo.responder()
  }) as unknown as typeof fetch
  return vistos
}

async function postJson(
  caminho: string,
  corpo: unknown,
  cookie: string,
  ambiente: Bindings,
) {
  return app.request(
    caminho,
    {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    },
    ambiente,
  )
}

async function getComCookie(
  caminho: string,
  cookie: string,
  ambiente: Bindings,
) {
  return app.request(caminho, { headers: { cookie } }, ambiente)
}

describe('POST /admin/distribution/proposals', () => {
  // A LIÇÃO da revisão anterior desta fatia: sem este teste ESCRITO ANTES
  // do caminho feliz, um refactor que troque requireAdmin por requireAuth
  // entra em verde — a votação é LIVRE, qualquer conta Google loga. É este
  // teste que a mutação obrigatória do Step 5 do brief precisa quebrar.
  test('conta autenticada mas não-admin responde 403 admin_only', async () => {
    const cookie = await cookieDeNaoAdmin()
    const res = await postJson(
      '/admin/distribution/proposals',
      { slug: 'post-x', body: 'corpo' },
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  test('nenhuma das 4 plataformas configurada ⇒ 503 distribution_unavailable', async () => {
    const cookie = await cookieDeAdmin()
    const res = await postJson(
      '/admin/distribution/proposals',
      { slug: 'post-x', body: 'corpo' },
      cookie,
      testEnv(),
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('distribution_unavailable')
    expect(body.notifications[0]?.message).toBe('Distribuição indisponível.')
  })

  test('slug ausente ⇒ 400 invalid_json com a mensagem literal do Go', async () => {
    const cookie = await cookieDeAdmin()
    const res = await postJson(
      '/admin/distribution/proposals',
      { title: 'T', body: 'corpo' },
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
    expect(body.notifications[0]?.message).toBe(
      "Corpo inválido: 'slug' é obrigatório.",
    )
  })

  test('corpo não é JSON válido ⇒ 400 invalid_json', async () => {
    const cookie = await cookieDeAdmin()
    const res = await postJson(
      '/admin/distribution/proposals',
      '{ isso não é json',
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
  })

  test('caminho feliz: artigo (devto) persiste com content = corpo completo, status pending', async () => {
    const cookie = await cookieDeAdmin()
    const res = await postJson(
      '/admin/distribution/proposals',
      {
        slug: 'meu-post',
        title: 'Meu Post',
        excerpt: 'resumo',
        url: 'https://blog/meu-post',
        body: 'corpo completo do artigo',
        tags: ['go', 'api'],
      },
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      targets: Array<{ platform: string; content: string; status: string }>
    }>
    expect(body.data?.targets).toEqual([
      {
        slug: 'meu-post',
        platform: 'devto',
        kind: 'article_crosspost',
        content: 'corpo completo do artigo',
        status: 'pending',
        remote_url: '',
        error: '',
      },
    ])

    // Persistido de verdade — não só devolvido em memória.
    const persistido = await getDistributionTarget(DB, 'meu-post', 'devto')
    expect(persistido?.status).toBe('pending')
  })

  test('social (bluesky) chama o promeia com o article certo e persiste o hook gerado', async () => {
    const cookie = await cookieDeAdmin()
    const vistos = mockarFetch([
      {
        prefixo: 'https://promeia.exemplo.test',
        responder: () =>
          jsonResponse(200, {
            ok: true,
            data: {
              hooks: [{ platform: 'bluesky', text: 'confere esse post!' }],
            },
          }),
      },
    ])

    const res = await postJson(
      '/admin/distribution/proposals',
      {
        slug: 'meu-post',
        title: 'Meu Post',
        excerpt: 'resumo',
        url: 'https://blog/meu-post',
        body: 'x'.repeat(1000),
        tags: ['go'],
      },
      cookie,
      testEnv({
        BLUESKY_HANDLE: MARCADOR_BLUESKY,
        BLUESKY_APP_PASSWORD: 'app-password',
        PROMEIA_URL: 'https://promeia.exemplo.test',
        PROMEIA_TOKEN: 'tok',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      targets: Array<{ platform: string; content: string }>
    }>
    expect(body.data?.targets).toEqual([
      {
        slug: 'meu-post',
        platform: 'bluesky',
        kind: 'social_hook',
        content: 'confere esse post!',
        status: 'pending',
        remote_url: '',
        error: '',
      },
    ])

    // voiceSample enviado ao promeia é o corpo cortado em 800 code points
    // (firstRunes) — não o corpo inteiro (1000 chars).
    const enviado = JSON.parse(vistos[0]?.init.body as string) as {
      article: { voice_sample: string }
      platforms: string[]
    }
    expect(enviado.article.voice_sample).toHaveLength(800)
    expect(enviado.platforms).toEqual(['bluesky'])
  })

  test('promeia recusa ⇒ 502 proposals_failed, nada é persistido', async () => {
    const cookie = await cookieDeAdmin()
    mockarFetch([
      {
        prefixo: 'https://promeia.exemplo.test',
        responder: () =>
          jsonResponse(500, { ok: false, code: 'x', message: 'falhou' }),
      },
    ])

    const res = await postJson(
      '/admin/distribution/proposals',
      { slug: 'outro-post', body: 'corpo' },
      cookie,
      testEnv({
        BLUESKY_HANDLE: MARCADOR_BLUESKY,
        BLUESKY_APP_PASSWORD: 'app-password',
        PROMEIA_URL: 'https://promeia.exemplo.test',
        PROMEIA_TOKEN: 'tok',
      }),
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('proposals_failed')
    expect(body.notifications[0]?.message).toBe('Falha ao gerar propostas.')

    const persistido = await getDistributionTarget(DB, 'outro-post', 'bluesky')
    expect(persistido).toBeNull()
  })
})

describe('GET /admin/distribution/:slug', () => {
  test('conta autenticada mas não-admin responde 403 admin_only', async () => {
    const cookie = await cookieDeNaoAdmin()
    const res = await getComCookie(
      '/admin/distribution/meu-post',
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  test('nenhuma das 4 plataformas configurada ⇒ 503 distribution_unavailable', async () => {
    const cookie = await cookieDeAdmin()
    const res = await getComCookie(
      '/admin/distribution/meu-post',
      cookie,
      testEnv(),
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('distribution_unavailable')
  })

  test('caminho feliz: devolve os alvos já persistidos do slug', async () => {
    const cookie = await cookieDeAdmin()
    await upsertDistributionTarget(DB, {
      slug: 'ja-existente',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'texto salvo',
    })

    const res = await getComCookie(
      '/admin/distribution/ja-existente',
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      targets: Array<{ platform: string; content: string }>
    }>
    expect(body.data?.targets).toHaveLength(1)
    expect(body.data?.targets[0]?.content).toBe('texto salvo')
  })

  test('falha de leitura do D1 ⇒ 500 internal_error, sem vazar o erro cru', async () => {
    const cookie = await cookieDeAdmin()
    const dbQuebrado = {
      prepare: (sql: string) => {
        if (sql.includes('FROM distribution_targets')) {
          throw new Error('D1_ERROR: disk I/O error (simulado)')
        }
        return DB.prepare(sql)
      },
      batch: DB.batch.bind(DB),
      exec: DB.exec.bind(DB),
      withSession: DB.withSession.bind(DB),
      dump: DB.dump.bind(DB),
    } as unknown as D1Database

    const res = await getComCookie('/admin/distribution/qualquer', cookie, {
      ...envComDevto(),
      DB: dbQuebrado,
    })
    expect(res.status).toBe(500)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('internal_error')
    const texto = JSON.stringify(body)
    expect(texto).not.toContain('D1_ERROR')
    expect(texto).not.toContain('disk I/O')
  })
})

describe('POST /admin/distribution/:slug/publish', () => {
  test('conta autenticada mas não-admin responde 403 admin_only', async () => {
    const cookie = await cookieDeNaoAdmin()
    const res = await postJson(
      '/admin/distribution/meu-post/publish',
      { targets: [] },
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  test('nenhuma das 4 plataformas configurada ⇒ 503 distribution_unavailable', async () => {
    const cookie = await cookieDeAdmin()
    const res = await postJson(
      '/admin/distribution/meu-post/publish',
      { targets: [] },
      cookie,
      testEnv(),
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('distribution_unavailable')
  })

  test('corpo não é JSON válido ⇒ 400 invalid_json', async () => {
    const cookie = await cookieDeAdmin()
    const res = await postJson(
      '/admin/distribution/meu-post/publish',
      '{ isso não é json',
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
    expect(body.notifications[0]?.message).toBe('Corpo inválido.')
  })

  // ⚠️ O teste que a advertência da T3 pedia: prova, por MUTAÇÃO possível
  // (não só leitura), que a rota TRADUZ canonical_url → canonicalUrl campo
  // a campo, em vez de fazer `body.targets as Selected[]`. Se a rota
  // fizesse o cast direto, `sel.canonicalUrl` ficaria `undefined` (a chave
  // do corpo é `canonical_url`, não `canonicalUrl`), `JSON.stringify`
  // OMITIRIA a chave no corpo mandado ao dev.to, e a asserção abaixo
  // falharia (`undefined !== 'https://blog/meu-post'`). Mesma prova cobre
  // `title`/`description`/`tags`.
  test('publish traduz canonical_url (wire) → canonicalUrl (Selected) até o corpo REAL enviado à plataforma', async () => {
    const cookie = await cookieDeAdmin()
    const vistos = mockarFetch([
      {
        prefixo: 'https://dev.to',
        responder: () => jsonResponse(201, { url: 'https://dev.to/post/1' }),
      },
    ])

    const res = await postJson(
      '/admin/distribution/meu-post/publish',
      {
        targets: [
          {
            platform: 'devto',
            content: 'corpo markdown',
            title: 'Meu Título',
            canonical_url: 'https://blog/meu-post',
            description: 'Uma descrição',
            tags: ['go', 'cloudflare'],
          },
        ],
      },
      cookie,
      envComDevto(),
    )
    expect(res.status).toBe(200)

    expect(vistos).toHaveLength(1)
    const corpoEnviado = JSON.parse(vistos[0]?.init.body as string) as {
      article: {
        title: string
        body_markdown: string
        canonical_url: string
        description: string
        tags: string[]
      }
    }
    expect(corpoEnviado.article.canonical_url).toBe('https://blog/meu-post')
    expect(corpoEnviado.article.title).toBe('Meu Título')
    expect(corpoEnviado.article.description).toBe('Uma descrição')
    expect(corpoEnviado.article.body_markdown).toBe('corpo markdown')
    expect(corpoEnviado.article.tags).toEqual(['go', 'cloudflare'])

    const body = (await res.json()) as Envelope<{
      targets: Array<{ platform: string; status: string; remote_url: string }>
    }>
    expect(body.data?.targets[0]).toMatchObject({
      platform: 'devto',
      status: 'posted',
      remote_url: 'https://dev.to/post/1',
    })
  })

  test('plataforma remota recusa ⇒ 502 publish_failed, alvo persiste como failed', async () => {
    const cookie = await cookieDeAdmin()
    mockarFetch([
      {
        prefixo: 'https://dev.to',
        responder: () => new Response('erro remoto', { status: 500 }),
      },
    ])

    const res = await postJson(
      '/admin/distribution/meu-post/publish',
      { targets: [{ platform: 'devto', content: 'corpo' }] },
      cookie,
      envComDevto(),
    )
    // ⚠️ Paridade com o Go: publishDistributionTargets NUNCA lança por uma
    // falha de publicação individual (marca 'failed' e segue o loop) — só
    // relança se a LEITURA/ESCRITA do D1 falhar. Então este cenário sai
    // 200 com o alvo marcado 'failed', não 502. O 502 publish_failed
    // (asserção abaixo) é reservado pra uma falha do PRÓPRIO
    // publishDistributionTargets (ex.: D1 fora do ar) — coberto no describe
    // seguinte.
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      targets: Array<{ platform: string; status: string; error: string }>
    }>
    expect(body.data?.targets[0]?.status).toBe('failed')

    const persistido = await getDistributionTarget(DB, 'meu-post', 'devto')
    expect(persistido?.status).toBe('failed')
  })

  test('falha do próprio orquestrador (D1 fora do ar) ⇒ 502 publish_failed', async () => {
    const cookie = await cookieDeAdmin()
    // ⚠️ Quebra SÓ as queries de `distribution_targets` — se quebrasse TODA
    // query, a autenticação (`requireAdmin` → `getSession`/`buscarGoogleSub`/
    // `upsertVotacaoUser`, todas contra o MESMO binding `DB`) falharia
    // ANTES de chegar na rota, e o teste mediria 503 auth_unavailable (do
    // middleware) em vez do 502 publish_failed (da própria rota) que este
    // teste quer provar. Mesma técnica de `criarShimQuebraMarkPosted`
    // (`domain/distribution-service.test.ts`) e do teste de 500 acima.
    const dbQuebrado = {
      prepare: (sql: string) => {
        if (sql.includes('distribution_targets')) {
          throw new Error('D1_ERROR: disk I/O error (simulado)')
        }
        return DB.prepare(sql)
      },
      batch: DB.batch.bind(DB),
      exec: DB.exec.bind(DB),
      withSession: DB.withSession.bind(DB),
      dump: DB.dump.bind(DB),
    } as unknown as D1Database

    const res = await postJson(
      '/admin/distribution/meu-post/publish',
      { targets: [{ platform: 'devto', content: 'corpo' }] },
      cookie,
      { ...envComDevto(), DB: dbQuebrado },
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('publish_failed')
    expect(body.notifications[0]?.message).toBe('Falha ao publicar.')
  })
})

describe('montarPublishers — armadilha 9 (só a PRIMEIRA credencial do par é validada)', () => {
  test('sem nenhuma credencial, a lista vem vazia', () => {
    expect(montarPublishers(testEnv())).toEqual([])
  })

  test('HASHNODE_API_TOKEN sozinho (sem PUBLICATION_ID) ainda constrói o publisher', () => {
    const pubs = montarPublishers(
      testEnv({ HASHNODE_API_TOKEN: MARCADOR_HASHNODE }),
    )
    expect(pubs.map((p) => p.platform)).toEqual(['hashnode'])
  })

  test('BLUESKY_HANDLE sozinho (sem APP_PASSWORD) ainda constrói o publisher', () => {
    const pubs = montarPublishers(testEnv({ BLUESKY_HANDLE: MARCADOR_BLUESKY }))
    expect(pubs.map((p) => p.platform)).toEqual(['bluesky'])
  })

  test('MASTODON_INSTANCE_URL sozinho (sem ACCESS_TOKEN) ainda constrói o publisher', () => {
    const pubs = montarPublishers(
      testEnv({ MASTODON_INSTANCE_URL: MARCADOR_MASTODON }),
    )
    expect(pubs.map((p) => p.platform)).toEqual(['mastodon'])
  })

  test('as 4 plataformas configuradas ⇒ os 4 kinds/platforms certos, na ordem do Go', () => {
    const pubs = montarPublishers(
      testEnv({
        DEVTO_API_KEY: MARCADOR_DEVTO,
        HASHNODE_API_TOKEN: MARCADOR_HASHNODE,
        HASHNODE_PUBLICATION_ID: 'pub-1',
        BLUESKY_HANDLE: MARCADOR_BLUESKY,
        BLUESKY_APP_PASSWORD: 'app-pw',
        MASTODON_INSTANCE_URL: MARCADOR_MASTODON,
        MASTODON_ACCESS_TOKEN: 'tok',
      }),
    )
    expect(pubs).toEqual([
      {
        platform: 'devto',
        kind: 'article_crosspost',
        publish: expect.any(Function),
      },
      {
        platform: 'hashnode',
        kind: 'article_crosspost',
        publish: expect.any(Function),
      },
      {
        platform: 'bluesky',
        kind: 'social_hook',
        publish: expect.any(Function),
      },
      {
        platform: 'mastodon',
        kind: 'social_hook',
        publish: expect.any(Function),
      },
    ])
  })
})

describe('as 7 credenciais nunca vazam numa resposta de erro', () => {
  test('publish_failed não ecoa nenhum marcador de credencial', async () => {
    const cookie = await cookieDeAdmin()
    mockarFetch([
      {
        prefixo: 'https://dev.to',
        responder: () => new Response('erro remoto', { status: 500 }),
      },
    ])
    const res = await postJson(
      '/admin/distribution/meu-post/publish',
      { targets: [{ platform: 'devto', content: 'corpo' }] },
      cookie,
      envComDevto(),
    )
    const texto = await res.text()
    expect(texto).not.toContain(MARCADOR_DEVTO)
  })
})
