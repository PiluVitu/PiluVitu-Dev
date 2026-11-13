/** @jest-environment node */
import { nextHeadersFalso, responder } from '@/lib/next-headers-falso'
import { sealToken } from '@/lib/admin/token-cookie'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)

import { POST } from './route'

const ORIGEM = 'http://localhost:3999'

function pedido(cabecalhos: Record<string, string> = {}) {
  return new Request(`${ORIGEM}/preview/end`, {
    method: 'POST',
    headers: {
      origin: ORIGEM,
      referer: `${ORIGEM}/posts/rascunho`,
      ...cabecalhos,
    },
  })
}

function cookiesDoPreviewLigado(extra: Record<string, string> = {}) {
  return {
    piluvitu_admin_gh: sealToken({ token: 'token-de-teste', login: 'alguem' }),
    __prerender_bypass: 'id-do-preview-do-build',
    piluvitu_preview: 'selado',
    'ks-branch': 'main',
    ...extra,
  }
}

function githubPermite(push: boolean) {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ permissions: { push, pull: true } }), {
      status: 200,
    }),
  )
}

beforeEach(() => {
  process.env.ADMIN_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
  nextHeadersFalso.reiniciar()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('POST /preview/end', () => {
  it('mantém a checagem de Origin', async () => {
    nextHeadersFalso.reiniciar(cookiesDoPreviewLigado(), true)
    githubPermite(true)

    const res = await responder(() =>
      POST(pedido({ origin: 'https://evil.example' })),
    )

    expect(res.status).toBe(400)
    expect(nextHeadersFalso.setCookies).toEqual([])
  })

  it('mantém a checagem de Referer', async () => {
    nextHeadersFalso.reiniciar(cookiesDoPreviewLigado(), true)
    githubPermite(true)
    const semReferer = new Request(`${ORIGEM}/preview/end`, {
      method: 'POST',
      headers: { origin: ORIGEM },
    })

    const res = await responder(() => POST(semReferer))

    expect(res.status).toBe(400)
    expect(nextHeadersFalso.setCookies).toEqual([])
  })

  // Desligar só apaga os cookies de quem pede. Exigir admin aqui prendia o preview no navegador
  // depois do /api/admin/github/unlink ou com o GitHub fora do ar (revisão de 2026-11-12).
  it('sem admin, só desliga o preview do próprio navegador, sem perguntar ao GitHub', async () => {
    nextHeadersFalso.reiniciar(
      {
        __prerender_bypass: 'id-do-preview-do-build',
        piluvitu_preview: 'selado',
        'ks-branch': 'main',
      },
      true,
    )
    const fetchSpy = jest.spyOn(globalThis, 'fetch')

    const res = await responder(() => POST(pedido()))

    expect(res.status).toBe(303)
    expect(res.location).toBe(`${ORIGEM}/posts/rascunho`)
    expect(nextHeadersFalso.draftLigado).toBe(false)
    expect(nextHeadersFalso.final('__prerender_bypass')?.apagado).toBe(true)
    expect(nextHeadersFalso.final('piluvitu_preview')?.apagado).toBe(true)
    expect(nextHeadersFalso.final('ks-branch')?.apagado).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('com o GitHub fora do ar, o admin linkado ainda desliga o preview', async () => {
    nextHeadersFalso.reiniciar(cookiesDoPreviewLigado(), true)
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'))

    const res = await responder(() => POST(pedido()))

    expect(res.status).toBe(303)
    expect(nextHeadersFalso.draftLigado).toBe(false)
    expect(nextHeadersFalso.final('piluvitu_preview')?.apagado).toBe(true)
    expect(nextHeadersFalso.final('ks-branch')?.apagado).toBe(true)
  })

  it('não mexe no cookie do GitHub linkado', async () => {
    nextHeadersFalso.reiniciar(cookiesDoPreviewLigado(), true)

    await responder(() => POST(pedido()))

    expect(nextHeadersFalso.final('piluvitu_admin_gh')).toBeUndefined()
  })

  it('desliga o draft mode, apaga o selado e o ks-branch e volta para o Referer', async () => {
    nextHeadersFalso.reiniciar(cookiesDoPreviewLigado(), true)

    const res = await responder(() => POST(pedido()))

    expect(res.status).toBe(303)
    expect(res.location).toBe(`${ORIGEM}/posts/rascunho`)
    expect(nextHeadersFalso.draftLigado).toBe(false)
    expect(nextHeadersFalso.final('__prerender_bypass')?.apagado).toBe(true)
    expect(nextHeadersFalso.final('piluvitu_preview')?.apagado).toBe(true)
    expect(nextHeadersFalso.final('ks-branch')?.apagado).toBe(true)
  })

  it('Referer de outro host não vira redirect para fora: vai para /', async () => {
    nextHeadersFalso.reiniciar(cookiesDoPreviewLigado(), true)

    const res = await responder(() =>
      POST(pedido({ referer: 'https://evil.example/pegadinha' })),
    )

    expect(res.status).toBe(303)
    expect(res.location).toBe(`${ORIGEM}/`)
  })

  it('Referer que não é URL também vai para /', async () => {
    nextHeadersFalso.reiniciar(cookiesDoPreviewLigado(), true)

    const res = await responder(() => POST(pedido({ referer: 'nao e url' })))

    expect(res.status).toBe(303)
    expect(res.location).toBe(`${ORIGEM}/`)
  })
})
