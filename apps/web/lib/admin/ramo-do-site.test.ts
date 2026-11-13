/** @jest-environment node */
import type { AdminGithubToken } from './token-cookie'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)
jest.mock('@/keystatic.config', () => ({
  getGithubRepoSlash: () => 'dono/repo-do-site',
}))

import { PRAZO_DA_CONSULTA_MS } from './exigir-admin'
import { ramoDoSiteExiste } from './ramo-do-site'

const TOKEN: AdminGithubToken = { token: 'token-de-teste', login: 'dona' }

function linkado(token: AdminGithubToken | null = TOKEN) {
  return async () => token
}

type ArgsDoFetch = [RequestInfo | URL, RequestInit?]

function github(status: number, corpo: unknown) {
  return jest.fn<Promise<Response>, ArgsDoFetch>(
    async () =>
      new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
        status,
      }),
  )
}

describe('ramoDoSiteExiste', () => {
  it('pergunta pelo ramo no repo do site, com o token da pessoa e prazo curto', async () => {
    const buscar = github(200, { name: 'feat/novo-post' })
    const timeout = jest.spyOn(AbortSignal, 'timeout')

    expect(
      await ramoDoSiteExiste('feat/novo-post', {
        obterToken: linkado(),
        fetch: buscar,
      }),
    ).toBe(true)

    const [url, init] = buscar.mock.calls[0]!
    expect(String(url)).toBe(
      'https://api.github.com/repos/dono/repo-do-site/branches/feat%2Fnovo-post',
    )
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer token-de-teste',
    )
    expect(init?.cache).toBe('no-store')
    expect(timeout).toHaveBeenCalledWith(PRAZO_DA_CONSULTA_MS)
    timeout.mockRestore()
  })

  it('sem GitHub linkado é false e nem pergunta ao GitHub', async () => {
    const buscar = github(200, { name: 'main' })
    expect(
      await ramoDoSiteExiste('main', {
        obterToken: linkado(null),
        fetch: buscar,
      }),
    ).toBe(false)
    expect(buscar).not.toHaveBeenCalled()
  })

  it.each([
    ['404', github(404, { message: 'Branch not found' })],
    ['401', github(401, { message: 'Bad credentials' })],
    ['500', github(500, '')],
    ['corpo que não é JSON', github(200, 'não é json')],
    ['corpo sem nome', github(200, {})],
    ['corpo null', github(200, 'null')],
    ['outro ramo (renomeado)', github(200, { name: 'outro' })],
  ])('%s é false', async (_caso, buscar) => {
    expect(
      await ramoDoSiteExiste('main', { obterToken: linkado(), fetch: buscar }),
    ).toBe(false)
  })

  it('erro de rede é false', async () => {
    const buscar = jest.fn<Promise<Response>, ArgsDoFetch>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(
      await ramoDoSiteExiste('main', { obterToken: linkado(), fetch: buscar }),
    ).toBe(false)
  })

  it('erro ao abrir o token linkado é false', async () => {
    const buscar = github(200, { name: 'main' })
    expect(
      await ramoDoSiteExiste('main', {
        obterToken: async () => {
          throw new Error('cookie quebrado')
        },
        fetch: buscar,
      }),
    ).toBe(false)
    expect(buscar).not.toHaveBeenCalled()
  })

  it('o prazo estourado é false', async () => {
    const buscar = jest.fn<Promise<Response>, ArgsDoFetch>(
      (_url, init) =>
        new Promise((_ok, falha) => {
          init?.signal?.addEventListener('abort', () =>
            falha(init.signal?.reason),
          )
        }),
    )
    expect(
      await ramoDoSiteExiste('main', {
        obterToken: linkado(),
        fetch: buscar,
        prazoMs: 20,
      }),
    ).toBe(false)
  })
})
