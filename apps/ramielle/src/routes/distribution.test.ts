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

  // ⚠️ M2 (fix round 1): a ORDEM entre a checagem de plataforma e o parse do
  // corpo é observável, e só este teste (combinando os dois defeitos ao
  // mesmo tempo) trava ela. Sem plataforma nenhuma configurada E corpo
  // quebrado, o correto (`handlers.go:57`, down() é a PRIMEIRA linha do
  // handler, antes de decodificar) é 503 — não 400. Provado por mutação:
  // mover a checagem `pubs.length === 0` pra DEPOIS do `c.req.json()`
  // mantém os outros 25 testes verdes (nenhum combina os dois defeitos) e
  // derruba só este.
  test('sem plataforma E com corpo quebrado ⇒ 503 (não 400) — a ordem importa', async () => {
    const cookie = await cookieDeAdmin()
    const res = await postJson(
      '/admin/distribution/proposals',
      '{ isso não é json',
      cookie,
      testEnv(), // nenhuma das 4 plataformas configurada
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('distribution_unavailable')
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

  // ⚠️ I1 (fix round 1, Important): o teste ACIMA usa 'x'.repeat(1000)
  // (ASCII puro) — `toHaveLength(800)` sobre uma string ASCII passa
  // IGUALMENTE com `[...s].slice(0,800).join('')` (code point, a
  // implementação certa) e com `s.slice(0,800)` (unidade UTF-16, a
  // implementação ERRADA) — ele é ESTRUTURALMENTE incapaz de provar a
  // propriedade que `firstRunes` alega. É o 11º caso desse padrão nesta
  // migração (armadilha 1 do plano, já provada por mutação em
  // `bluesky.ts`/`mastodon.ts` na Task 2 — aqui não tinha sido). Este teste
  // usa emoji (cada 😀 ocupa 2 unidades UTF-16, 1 code point): só a versão
  // por CODE POINT bate exatamente 800 em `[...voice_sample].length` — a
  // versão por `.length`/`.slice` cortaria no MEIO de um par surrogate,
  // divergindo do Go em silêncio (o hook social gerado a partir de um
  // voice_sample truncado errado é o que vai pro perfil público).
  test('firstRunes corta por CODE POINT, não unidade UTF-16 — prova com emoji', async () => {
    const cookie = await cookieDeAdmin()
    const vistos = mockarFetch([
      {
        prefixo: 'https://promeia.exemplo.test',
        responder: () => jsonResponse(200, { ok: true, data: { hooks: [] } }),
      },
    ])

    const res = await postJson(
      '/admin/distribution/proposals',
      {
        slug: 'post-emoji',
        title: 'T',
        excerpt: 'e',
        url: 'https://blog/post-emoji',
        body: '😀'.repeat(1000),
        tags: [],
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

    const enviado = JSON.parse(vistos[0]?.init.body as string) as {
      article: { voice_sample: string }
    }
    expect([...enviado.article.voice_sample]).toHaveLength(800)
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
    // M3 (fix round 1): a mensagem também é conteúdo — o apps/web joga
    // primary.message direto em toast.error, então um typo aqui chegaria
    // ao dono sem teste vermelho se só o code fosse conferido.
    expect(body.notifications[0]?.message).toBe('Falha ao ler distribuição.')
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

  // ⚠️ M2 (fix round 1) — mesma prova de ordem que `proposals` ganhou acima,
  // aplicada aqui. Ver o comentário lá pro raciocínio completo.
  test('sem plataforma E com corpo quebrado ⇒ 503 (não 400) — a ordem importa', async () => {
    const cookie = await cookieDeAdmin()
    const res = await postJson(
      '/admin/distribution/meu-post/publish',
      '{ isso não é json',
      cookie,
      testEnv(), // nenhuma das 4 plataformas configurada
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('distribution_unavailable')
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

  // ⚠️ M1 (fix round 1): o nome ANTERIOR deste teste ("⇒ 502 publish_failed")
  // contradizia a própria asserção (`toBe(200)`) — quem grepasse "502
  // publish_failed" achava este teste e podia apagar o que de fato exercita
  // 502 (o próximo, "falha do próprio orquestrador"). O corpo/comentário já
  // explicavam certo o PORQUÊ de ser 200; só o título mentia.
  test('plataforma remota recusa ⇒ 200 com o alvo marcado failed (publishDistributionTargets não relança por falha individual)', async () => {
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
    // 200 com o alvo marcado 'failed', não 502. O 502 publish_failed é
    // reservado pra uma falha do PRÓPRIO publishDistributionTargets (ex.:
    // D1 fora do ar) — coberto no teste seguinte.
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

// ⚠️ M1+M5 (fix round 1): esta describe se chamava "as 7 credenciais nunca
// vazam", mas só exercitava o dev.to (1 de 4 plataformas) — nome prometia
// mais cobertura do que o teste entregava. A T2 (lib/publishers/*.test.ts)
// já prova não-vazamento por ADAPTER isoladamente; o que faltava aqui era a
// mesma garantia na FRONTEIRA da rota (`traduzirSelected`/`montarPublishers`
// não introduzem um vazamento novo), então agora é um caso por plataforma,
// não um resumo de 1.
//
// ⚠️ A2 (revisão final da fatia) — o caso `bluesky` estava testando o
// marcador ERRADO. `BLUESKY_HANDLE` é o dado que o produto PUBLICA de
// propósito (`lib/publishers/bluesky.ts:218`, dentro da `remote_url`) — não
// é o segredo. `BLUESKY_APP_PASSWORD` (a credencial de verdade) não tinha
// NENHUMA asserção: vazar a app password passava verde na fronteira da
// rota. Corrigido pra 1 linha POR CREDENCIAL (7 no total — as 3 "segundas
// do par", `HASHNODE_PUBLICATION_ID`/`BLUESKY_APP_PASSWORD`/
// `MASTODON_INSTANCE_URL`, ganharam marcador próprio; a 4ª segunda,
// `MASTODON_ACCESS_TOKEN`, já tinha), em vez de 1 por plataforma — cada
// linha isola a credencial sob teste (as outras do mesmo par recebem um
// valor comum, não-marcador), então cada uma prova por mutação
// independentemente.
describe('nenhuma credencial vaza numa resposta de erro (as 7 credenciais, na fronteira da rota) — A2', () => {
  const MASTODON_URL_TESTE = 'https://mastodon.exemplo.test'
  const MASTODON_INSTANCE_URL_MARCADA =
    'https://instancia-marcador-mastodon-nao-pode-vazar-52c1.test'
  const MARCADOR_HASHNODE_PUBLICATION_ID =
    'MARCADOR-HASHNODE-PUBLICATION-ID-NAO-PODE-VAZAR-6b1c'
  const MARCADOR_BLUESKY_APP_PASSWORD =
    'MARCADOR-BLUESKY-APP-PASSWORD-NAO-PODE-VAZAR-4d8e'

  test.each([
    {
      platform: 'devto',
      credencial: 'DEVTO_API_KEY',
      marcador: MARCADOR_DEVTO,
      prefixo: 'https://dev.to',
      env: { DEVTO_API_KEY: MARCADOR_DEVTO },
    },
    {
      platform: 'hashnode',
      credencial: 'HASHNODE_API_TOKEN (1ª do par)',
      marcador: MARCADOR_HASHNODE,
      prefixo: 'https://gql.hashnode.com',
      env: {
        HASHNODE_API_TOKEN: MARCADOR_HASHNODE,
        HASHNODE_PUBLICATION_ID: 'pub-normal',
      },
    },
    {
      // ⚠️ A2: sem marcador antes.
      platform: 'hashnode',
      credencial: 'HASHNODE_PUBLICATION_ID (2ª do par)',
      marcador: MARCADOR_HASHNODE_PUBLICATION_ID,
      prefixo: 'https://gql.hashnode.com',
      env: {
        HASHNODE_API_TOKEN: 'token-normal',
        HASHNODE_PUBLICATION_ID: MARCADOR_HASHNODE_PUBLICATION_ID,
      },
    },
    {
      // Pública de propósito (embutida na remote_url em sucesso) — mantida
      // aqui só por completude das 7; NÃO é a asserção decisiva do par.
      platform: 'bluesky',
      credencial: 'BLUESKY_HANDLE (1ª do par, pública)',
      marcador: MARCADOR_BLUESKY,
      prefixo: 'https://bsky.social',
      env: {
        BLUESKY_HANDLE: MARCADOR_BLUESKY,
        BLUESKY_APP_PASSWORD: 'app-password-normal',
      },
    },
    {
      // ⚠️ A2: a credencial que é SEGREDO de verdade — sem asserção nenhuma
      // antes (o caso `bluesky` original testava só o HANDLE, acima).
      platform: 'bluesky',
      credencial: 'BLUESKY_APP_PASSWORD (2ª do par, segredo)',
      marcador: MARCADOR_BLUESKY_APP_PASSWORD,
      prefixo: 'https://bsky.social',
      env: {
        BLUESKY_HANDLE: 'handle-normal.bsky.social',
        BLUESKY_APP_PASSWORD: MARCADOR_BLUESKY_APP_PASSWORD,
      },
    },
    {
      // ⚠️ A2: sem marcador antes.
      platform: 'mastodon',
      credencial: 'MASTODON_INSTANCE_URL (1ª do par)',
      marcador: MASTODON_INSTANCE_URL_MARCADA,
      prefixo: MASTODON_INSTANCE_URL_MARCADA,
      env: {
        MASTODON_INSTANCE_URL: MASTODON_INSTANCE_URL_MARCADA,
        MASTODON_ACCESS_TOKEN: 'token-normal',
      },
    },
    {
      platform: 'mastodon',
      credencial: 'MASTODON_ACCESS_TOKEN (2ª do par)',
      marcador: MARCADOR_MASTODON,
      prefixo: MASTODON_URL_TESTE,
      env: {
        MASTODON_INSTANCE_URL: MASTODON_URL_TESTE,
        MASTODON_ACCESS_TOKEN: MARCADOR_MASTODON,
      },
    },
  ])(
    '$platform ($credencial): o marcador não aparece na resposta de erro',
    async ({ platform, marcador, prefixo, env }) => {
      const cookie = await cookieDeAdmin()
      mockarFetch([
        {
          prefixo,
          responder: () => new Response('erro remoto', { status: 500 }),
        },
      ])
      const res = await postJson(
        '/admin/distribution/marcador-post/publish',
        { targets: [{ platform, content: 'corpo' }] },
        cookie,
        testEnv(env),
      )
      expect(res.status).toBe(200)
      // `res.text()`, não `res.json()` — o corpo só pode ser lido uma vez;
      // esta é a asserção de não-vazamento (via texto cru) E a de status
      // (via JSON.parse do MESMO texto já lido).
      const texto = await res.text()
      const body = JSON.parse(texto) as Envelope<{
        targets: Array<{ platform: string; status: string }>
      }>
      expect(body.data?.targets[0]?.status).toBe('failed')
      expect(texto).not.toContain(marcador)
    },
  )
})
