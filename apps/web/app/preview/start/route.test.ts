/** @jest-environment node */
import { nextHeadersFalso, responder } from '@/lib/next-headers-falso'
import { sealToken } from '@/lib/admin/token-cookie'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)
jest.mock('@/keystatic.config', () => ({
  getGithubRepoSlash: () => 'PiluVitu/PiluVitu-Dev',
}))

import { GET } from './route'

// Achado de 2026-11-12: este GET ligava o draft mode e gravava o `ks-branch` para qualquer
// visitante, e com isso a home e /posts/<slug> mostravam os rascunhos do blog privado.

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres'
const TOKEN_DO_GITHUB = 'token-de-teste-do-github'

function pedido(
  query = '?to=/posts/rascunho&branch=main',
  cabecalhos: Record<string, string> = { 'sec-fetch-site': 'none' },
) {
  return new Request(`http://localhost:3999/preview/start${query}`, {
    headers: cabecalhos,
  })
}

function cookieDoAdmin() {
  return {
    piluvitu_admin_gh: sealToken({ token: TOKEN_DO_GITHUB, login: 'alguem' }),
  }
}

function githubResponde(status: number, corpo: unknown) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(corpo), { status }))
}

const PODE_ESCREVER = { permissions: { admin: false, push: true, pull: true } }
const SO_LEITURA = { permissions: { admin: false, push: false, pull: true } }

const URL_DOS_RAMOS =
  'https://api.github.com/repos/PiluVitu/PiluVitu-Dev/branches/'

/**
 * O GitHub falso do admin: o repo do blog diz que a pessoa escreve nele, e o repo do site
 * responde `GET /branches/{ramo}` com o próprio ramo, ou com o que `ramo` devolver.
 */
function githubDoAdmin(
  ramo: (nome: string) => Response | Promise<Response> = (nome) =>
    new Response(JSON.stringify({ name: nome }), { status: 200 }),
) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const endereco = String(url)
    if (endereco.startsWith(URL_DOS_RAMOS)) {
      return ramo(decodeURIComponent(endereco.slice(URL_DOS_RAMOS.length)))
    }
    return new Response(JSON.stringify(PODE_ESCREVER), { status: 200 })
  })
}

beforeEach(() => {
  process.env.ADMIN_TOKEN_SECRET = SEGREDO
  nextHeadersFalso.reiniciar()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('GET /preview/start sem admin', () => {
  it('anônimo leva 401, sem nenhum Set-Cookie e sem ligar o draft mode', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const res = await responder(() => GET(pedido('?to=/&branch=main')))

    expect(res.status).toBe(401)
    expect(res.location).toBeNull()
    expect(nextHeadersFalso.setCookies).toEqual([])
    expect(nextHeadersFalso.draftLigado).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('GitHub linkado de quem não escreve no repo do blog leva 401, sem Set-Cookie', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubResponde(200, SO_LEITURA)

    const res = await responder(() => GET(pedido()))

    expect(res.status).toBe(401)
    expect(nextHeadersFalso.setCookies).toEqual([])
    expect(nextHeadersFalso.draftLigado).toBe(false)
  })

  it('conta que não vê o repo do blog (404 do GitHub) leva 401', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubResponde(404, { message: 'Not Found' })

    const res = await responder(() => GET(pedido()))

    expect(res.status).toBe(401)
    expect(nextHeadersFalso.setCookies).toEqual([])
  })

  it('GitHub fora do ar leva 401, sem Set-Cookie', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'))

    const res = await responder(() => GET(pedido()))

    expect(res.status).toBe(401)
    expect(nextHeadersFalso.setCookies).toEqual([])
  })

  it('cookie do GitHub forjado leva 401 sem perguntar ao GitHub', async () => {
    nextHeadersFalso.reiniciar({ piluvitu_admin_gh: 'forjado' })
    const fetchSpy = jest.spyOn(globalThis, 'fetch')

    const res = await responder(() => GET(pedido()))

    expect(res.status).toBe(401)
    expect(nextHeadersFalso.setCookies).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('GET /preview/start de quem escreve no repo do blog', () => {
  it('pergunta ao GitHub com o token da pessoa, pelo repo do blog e pelo ramo no repo do site', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    const fetchSpy = githubDoAdmin()

    await responder(() => GET(pedido('?to=/&branch=feat/novo-post.v2')))

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [urlDoBlog, initDoBlog] = fetchSpy.mock.calls[0]!
    expect(String(urlDoBlog)).toBe(
      'https://api.github.com/repos/PiluVitu/piluvitu-blog',
    )
    expect(new Headers(initDoBlog?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN_DO_GITHUB}`,
    )
    const [urlDoRamo, initDoRamo] = fetchSpy.mock.calls[1]!
    expect(String(urlDoRamo)).toBe(`${URL_DOS_RAMOS}feat%2Fnovo-post.v2`)
    expect(new Headers(initDoRamo?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN_DO_GITHUB}`,
    )
  })

  it('liga o preview com o cookie selado, curto e HttpOnly, e redireciona com 307', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubDoAdmin()

    const res = await responder(() => GET(pedido()))

    expect(res.status).toBe(307)
    expect(res.location).toBe('http://localhost:3999/posts/rascunho')
    expect(nextHeadersFalso.draftLigado).toBe(true)

    const selado = nextHeadersFalso.final('piluvitu_preview')
    expect(selado?.apagado).toBe(false)
    expect(selado?.valor).toBeTruthy()
    expect(selado?.valor).not.toContain('main')
    expect(selado?.opcoes).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
    expect(selado?.opcoes.maxAge).toBeGreaterThan(0)
    expect(selado?.opcoes.maxAge).toBeLessThanOrEqual(3600)
  })

  it('o __prerender_bypass sai com SameSite=Lax e o mesmo prazo curto', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubDoAdmin()

    await responder(() => GET(pedido()))

    const bypass = nextHeadersFalso.final('__prerender_bypass')
    expect(bypass?.valor).toBe(nextHeadersFalso.previewModeId)
    expect(bypass?.opcoes).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
    expect(bypass?.opcoes.maxAge).toBeLessThanOrEqual(3600)
  })

  it('apaga o ks-branch antigo', async () => {
    nextHeadersFalso.reiniciar({ ...cookieDoAdmin(), 'ks-branch': 'velho' })
    githubDoAdmin()

    await responder(() => GET(pedido()))

    expect(nextHeadersFalso.final('ks-branch')?.apagado).toBe(true)
  })

  it('em produção os dois cookies saem com Secure', async () => {
    const ambiente = process.env as Record<string, string | undefined>
    const antes = ambiente.NODE_ENV
    ambiente.NODE_ENV = 'production'
    try {
      nextHeadersFalso.reiniciar(cookieDoAdmin())
      githubDoAdmin()

      await responder(() => GET(pedido()))

      expect(nextHeadersFalso.final('piluvitu_preview')?.opcoes.secure).toBe(
        true,
      )
      expect(nextHeadersFalso.final('__prerender_bypass')?.opcoes.secure).toBe(
        true,
      )
    } finally {
      ambiente.NODE_ENV = antes
    }
  })

  it.each([
    ['sem to', '?branch=main'],
    ['sem branch', '?to=/'],
    ['to absoluto', '?to=https://evil.example/&branch=main'],
    ['to protocol-relative', '?to=//evil.example/&branch=main'],
    ['to com barra invertida', '?to=/%5Cevil.example/&branch=main'],
    ['to com tab que vira //', '?to=/%09/evil.example/&branch=main'],
    ['to sem barra', '?to=posts&branch=main'],
    ['branch com ..', '?to=/&branch=main/../x'],
    ['branch começando com -', '?to=/&branch=-x'],
    ['branch começando com /', '?to=/&branch=/main'],
    ['branch com espaço', '?to=/&branch=a%20b'],
    ['branch longo demais', `?to=/&branch=${'a'.repeat(101)}`],
    ['branch com refs/ (PR de fork)', '?to=/&branch=refs/pull/1/head'],
    [
      'branch pull/ (o git resolve como refs/pull/)',
      '?to=/&branch=pull/1/head',
    ],
    [
      'branch que é um SHA de 40',
      `?to=/&branch=${'0123456789abcdef'.repeat(2)}01234567`,
    ],
  ])('%s leva 400, sem Set-Cookie', async (_caso, query) => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubDoAdmin()

    const res = await responder(() => GET(pedido(query)))

    expect(res.status).toBe(400)
    expect(nextHeadersFalso.setCookies).toEqual([])
    expect(nextHeadersFalso.draftLigado).toBe(false)
  })

  it('aceita ramo com barra, ponto e hífen', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubDoAdmin()

    const res = await responder(() =>
      GET(pedido('?to=/pilulabs?x=1&branch=feat/novo-post.v2')),
    )

    expect(res.status).toBe(307)
    expect(res.location).toBe('http://localhost:3999/pilulabs?x=1')
  })
})

// Revisão de 2026-11-12, medida num build de produção com um GitHub falso: o
// piluvitu_admin_gh é SameSite=Lax e vai junto numa navegação vinda de outro site, então um
// link de fora ligava o preview do admin num ramo escolhido por quem fez o link (refs/pull/N/head
// de um PR de fork, ou um SHA), com o conteúdo e os feeds desse ramo.
describe('GET /preview/start de outro site', () => {
  it.each([['cross-site'], ['same-site'], [null]])(
    'Sec-Fetch-Site %s leva 403, sem Set-Cookie e sem ligar o draft mode',
    async (secFetchSite) => {
      nextHeadersFalso.reiniciar(cookieDoAdmin())
      githubDoAdmin()

      const res = await responder(() =>
        GET(
          pedido(
            '?to=/&branch=main',
            secFetchSite ? { 'sec-fetch-site': secFetchSite } : {},
          ),
        ),
      )

      expect(res.status).toBe(403)
      expect(nextHeadersFalso.setCookies).toEqual([])
      expect(nextHeadersFalso.draftLigado).toBe(false)
    },
  )

  it.each([['same-origin'], ['none']])(
    'Sec-Fetch-Site %s (link do próprio site ou URL digitada) liga o preview',
    async (secFetchSite) => {
      nextHeadersFalso.reiniciar(cookieDoAdmin())
      githubDoAdmin()

      const res = await responder(() =>
        GET(pedido('?to=/&branch=main', { 'sec-fetch-site': secFetchSite })),
      )

      expect(res.status).toBe(307)
      expect(nextHeadersFalso.draftLigado).toBe(true)
    },
  )
})

describe('GET /preview/start com ramo que não está no repo do site', () => {
  it('ramo inexistente (404 do GitHub) leva 400, sem Set-Cookie', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubDoAdmin(
      () =>
        new Response(JSON.stringify({ message: 'Branch not found' }), {
          status: 404,
        }),
    )

    const res = await responder(() => GET(pedido('?to=/&branch=nao-existe')))

    expect(res.status).toBe(400)
    expect(nextHeadersFalso.setCookies).toEqual([])
    expect(nextHeadersFalso.draftLigado).toBe(false)
  })

  it('GitHub fora do ar na conferência do ramo leva 400, sem Set-Cookie', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubDoAdmin(() => Promise.reject(new TypeError('fetch failed')))

    const res = await responder(() => GET(pedido('?to=/&branch=main')))

    expect(res.status).toBe(400)
    expect(nextHeadersFalso.setCookies).toEqual([])
  })

  it('o GitHub devolver outro ramo (renomeado) leva 400', async () => {
    nextHeadersFalso.reiniciar(cookieDoAdmin())
    githubDoAdmin(
      () => new Response(JSON.stringify({ name: 'outro' }), { status: 200 }),
    )

    const res = await responder(() => GET(pedido('?to=/&branch=main')))

    expect(res.status).toBe(400)
    expect(nextHeadersFalso.setCookies).toEqual([])
  })
})
