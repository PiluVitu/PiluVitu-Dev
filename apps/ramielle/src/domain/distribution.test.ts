import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import {
  getDistributionTarget,
  listDistributionTargetsBySlug,
  markDistributionTargetFailed,
  markDistributionTargetPosted,
  upsertDistributionTarget,
} from './distribution'

const DB = env.DB

describe('upsertDistributionTarget + listDistributionTargetsBySlug', () => {
  it('insere um alvo novo e aparece no ListBySlug — porte de TestUpsertAndList (store_test.go:25-33)', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'post-1',
      platform: 'bluesky',
      kind: 'social_hook',
      content: 'oi',
      status: 'pending',
    })

    const alvos = await listDistributionTargetsBySlug(DB, 'post-1')
    expect(alvos).toEqual([
      {
        slug: 'post-1',
        platform: 'bluesky',
        kind: 'social_hook',
        content: 'oi',
        status: 'pending',
        remote_url: '',
        error: '',
      },
    ])
  })

  it('upsert de novo na mesma (slug, platform) NÃO duplica — atualiza content, porte de TestUpsertAndList (store_test.go:33-44)', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'post-1',
      platform: 'bluesky',
      kind: 'social_hook',
      content: 'oi',
      status: 'pending',
    })
    await upsertDistributionTarget(DB, {
      slug: 'post-1',
      platform: 'bluesky',
      kind: 'social_hook',
      content: 'oi v2',
      status: 'pending',
    })

    const alvos = await listDistributionTargetsBySlug(DB, 'post-1')
    expect(alvos).toHaveLength(1)
    expect(alvos[0]?.content).toBe('oi v2')
  })

  it('devolve array vazio quando o slug não tem alvo nenhum', async () => {
    expect(await listDistributionTargetsBySlug(DB, 'inexistente')).toEqual([])
  })

  it('ORDER BY kind, platform — kind decide primeiro, platform desempata dentro do kind', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'post-2',
      platform: 'mastodon',
      kind: 'social_hook',
      content: 'a',
    })
    await upsertDistributionTarget(DB, {
      slug: 'post-2',
      platform: 'bluesky',
      kind: 'social_hook',
      content: 'b',
    })
    await upsertDistributionTarget(DB, {
      slug: 'post-2',
      platform: 'hashnode',
      kind: 'article_crosspost',
      content: 'c',
    })
    await upsertDistributionTarget(DB, {
      slug: 'post-2',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'd',
    })

    const alvos = await listDistributionTargetsBySlug(DB, 'post-2')
    // 'article_crosspost' < 'social_hook' alfabeticamente; dentro de cada
    // kind, platform desempata alfabeticamente.
    expect(alvos.map((a) => [a.kind, a.platform])).toEqual([
      ['article_crosspost', 'devto'],
      ['article_crosspost', 'hashnode'],
      ['social_hook', 'bluesky'],
      ['social_hook', 'mastodon'],
    ])
  })

  it('status omitido vira "pending" — porte de statusOr (store.go:44-50)', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'post-3',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'x',
      // status omitido de propósito.
    })
    const [alvo] = await listDistributionTargetsBySlug(DB, 'post-3')
    expect(alvo?.status).toBe('pending')
  })

  it('status vazio ("") também vira "pending" — mesmo statusOr, caminho da string em branco', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'post-3b',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'x',
      status: '',
    })
    const [alvo] = await listDistributionTargetsBySlug(DB, 'post-3b')
    expect(alvo?.status).toBe('pending')
  })

  it('kind também é sobrescrito no upsert — diferente de status, não há preservação nenhuma pra kind', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'post-3c',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'x',
    })
    await upsertDistributionTarget(DB, {
      slug: 'post-3c',
      platform: 'devto',
      kind: 'social_hook',
      content: 'x',
    })
    const [alvo] = await listDistributionTargetsBySlug(DB, 'post-3c')
    expect(alvo?.kind).toBe('social_hook')
  })

  // ⚠️ created_at/posted_at existem na tabela mas o SELECT deste domínio é
  // EXAUSTIVO de propósito (mesma lista do Go, store.go:68-69) — nenhuma
  // das duas colunas atravessa o fio hoje. Ver o comentário de
  // `distribution.ts` pro porquê isso importa (a armadilha de data crua do
  // D1 não se aplica enquanto isto continuar assim).
  it('created_at/posted_at NUNCA saem no shape devolvido', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'post-4',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'x',
    })
    const [alvo] = await listDistributionTargetsBySlug(DB, 'post-4')
    expect(Object.keys(alvo!)).toEqual([
      'slug',
      'platform',
      'kind',
      'content',
      'status',
      'remote_url',
      'error',
    ])
  })
})

describe('getDistributionTarget', () => {
  it('null quando o alvo não existe — nunca lança (porte de Store.Get, store.go:88-100)', async () => {
    expect(await getDistributionTarget(DB, 'nada', 'devto')).toBeNull()
  })

  it('devolve o alvo por (slug, platform)', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'p',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'x',
    })
    const alvo = await getDistributionTarget(DB, 'p', 'devto')
    expect(alvo?.content).toBe('x')
  })

  it('platform diferente na mesma slug não colide — a chave é o PAR (slug, platform)', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'p',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'artigo',
    })
    await upsertDistributionTarget(DB, {
      slug: 'p',
      platform: 'bluesky',
      kind: 'social_hook',
      content: 'hook',
    })
    expect((await getDistributionTarget(DB, 'p', 'devto'))?.content).toBe(
      'artigo',
    )
    expect((await getDistributionTarget(DB, 'p', 'bluesky'))?.content).toBe(
      'hook',
    )
  })
})

describe('markDistributionTargetPosted — porte de TestMarkPosted (store_test.go:47-61)', () => {
  it('marca posted, grava remote_url, limpa error', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'p',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'x',
      status: 'pending',
    })
    await markDistributionTargetFailed(DB, 'p', 'devto', 'erro anterior')

    await markDistributionTargetPosted(
      DB,
      'p',
      'devto',
      'https://dev.to/a',
      '2026-08-13T12:00:00Z',
    )

    const alvo = await getDistributionTarget(DB, 'p', 'devto')
    expect(alvo?.status).toBe('posted')
    expect(alvo?.remote_url).toBe('https://dev.to/a')
    // MarkPosted limpa error='' — mesmo que TestMarkPosted não exercite
    // isso (ele parte de um alvo sem falha prévia), store.go:105 é
    // explícito: error='' é parte do UPDATE.
    expect(alvo?.error).toBe('')
  })
})

describe('markDistributionTargetFailed', () => {
  it('marca failed e grava a mensagem de erro, sem tocar remote_url — porte de Store.MarkFailed (store.go:110-116)', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'p',
      platform: 'devto',
      kind: 'article_crosspost',
      content: 'x',
      status: 'pending',
    })
    await markDistributionTargetPosted(
      DB,
      'p',
      'devto',
      'https://dev.to/a',
      '2026-08-13T12:00:00Z',
    )
    await markDistributionTargetFailed(DB, 'p', 'devto', 'timeout')

    const alvo = await getDistributionTarget(DB, 'p', 'devto')
    expect(alvo?.status).toBe('failed')
    expect(alvo?.error).toBe('timeout')
    // MarkFailed não mexe em remote_url — o UPDATE do Go só toca
    // status/error (store.go:112-113).
    expect(alvo?.remote_url).toBe('https://dev.to/a')
  })
})

// ⚠️ O caso que mais importa desta task (armadilha 4 do plano,
// store.go:58-63): re-upsert sobre um alvo já 'posted' reescreve o
// content, mas o `CASE WHEN ... THEN 'posted' ELSE excluded.status END`
// impede o status de ser rebaixado de volta pra 'pending'. Porte de
// TestUpsertPreservesPostedStatus (store_test.go:63-79).
describe('upsertDistributionTarget preserva status posted — armadilha 4', () => {
  it('re-upsert sobre um alvo posted reescreve content, mas PRESERVA status e remote_url', async () => {
    await upsertDistributionTarget(DB, {
      slug: 'q',
      platform: 'bluesky',
      kind: 'social_hook',
      content: 'v1',
      status: 'pending',
    })
    await markDistributionTargetPosted(
      DB,
      'q',
      'bluesky',
      'https://bsky.app/x',
      '2026-08-13T12:00:00Z',
    )

    // Re-propose: fluxo normal de "gerar propostas de novo" — não pode
    // rebaixar pra pending, mas content tem que atualizar.
    await upsertDistributionTarget(DB, {
      slug: 'q',
      platform: 'bluesky',
      kind: 'social_hook',
      content: 'v2',
      status: 'pending',
    })

    const alvo = await getDistributionTarget(DB, 'q', 'bluesky')
    expect(alvo?.status).toBe('posted')
    expect(alvo?.remote_url).toBe('https://bsky.app/x')
    expect(alvo?.content).toBe('v2')
  })
})
