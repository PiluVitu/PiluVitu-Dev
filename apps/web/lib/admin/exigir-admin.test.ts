/** @jest-environment node */
import type { AdminGithubToken } from './token-cookie'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)

import { PRAZO_DA_CONSULTA_MS, exigirAdmin } from './exigir-admin'

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

afterEach(() => {
  delete process.env.BLOG_REPO_OWNER
  delete process.env.BLOG_REPO_NAME
  jest.restoreAllMocks()
})

describe('exigirAdmin', () => {
  it('sem GitHub linkado é null e nem pergunta ao GitHub', async () => {
    const buscar = github(200, { permissions: { push: true } })
    expect(
      await exigirAdmin({ obterToken: linkado(null), fetch: buscar }),
    ).toBeNull()
    expect(buscar).not.toHaveBeenCalled()
  })

  it.each([
    ['push', { push: true }],
    ['maintain', { maintain: true }],
    ['admin', { admin: true }],
  ])('com %s no repo do blog devolve o login', async (_caso, permissions) => {
    const buscar = github(200, { permissions })
    expect(await exigirAdmin({ obterToken: linkado(), fetch: buscar })).toEqual(
      { login: 'dona' },
    )
  })

  it('pergunta pelo repo do blog com o token da pessoa e prazo curto', async () => {
    const buscar = github(200, { permissions: { push: true } })
    await exigirAdmin({ obterToken: linkado(), fetch: buscar })

    const [url, init] = buscar.mock.calls[0]!
    expect(String(url)).toBe(
      'https://api.github.com/repos/PiluVitu/piluvitu-blog',
    )
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer token-de-teste',
    )
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(PRAZO_DA_CONSULTA_MS).toBeLessThanOrEqual(5000)
  })

  it('usa BLOG_REPO_OWNER e BLOG_REPO_NAME, como lib/blog-posts', async () => {
    process.env.BLOG_REPO_OWNER = 'outra-org'
    process.env.BLOG_REPO_NAME = 'outro-blog'
    const buscar = github(200, { permissions: { push: true } })
    await exigirAdmin({ obterToken: linkado(), fetch: buscar })
    expect(String(buscar.mock.calls[0]![0])).toBe(
      'https://api.github.com/repos/outra-org/outro-blog',
    )
  })

  it.each([
    ['só leitura', 200, { permissions: { push: false, pull: true } }],
    ['sem permissions', 200, { name: 'piluvitu-blog' }],
    ['permissions fora do formato', 200, { permissions: 'push' }],
    ['push como texto', 200, { permissions: { push: 'true' } }],
    ['corpo que não é JSON', 200, 'não é json'],
    ['401', 401, { message: 'Bad credentials' }],
    ['403', 403, { message: 'Forbidden' }],
    ['404', 404, { message: 'Not Found' }],
    ['500', 500, {}],
  ])('%s é null (falha fechada)', async (_caso, status, corpo) => {
    expect(
      await exigirAdmin({
        obterToken: linkado(),
        fetch: github(status, corpo),
      }),
    ).toBeNull()
  })

  it('erro de rede é null', async () => {
    const buscar = jest.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(
      await exigirAdmin({ obterToken: linkado(), fetch: buscar }),
    ).toBeNull()
  })

  it('erro ao ler o token linkado é null', async () => {
    const buscar = github(200, { permissions: { push: true } })
    const obterToken = async (): Promise<AdminGithubToken | null> => {
      throw new Error('ADMIN_TOKEN_SECRET is not set')
    }
    expect(await exigirAdmin({ obterToken, fetch: buscar })).toBeNull()
  })

  it('GitHub que não responde dentro do prazo é null', async () => {
    const buscar = jest.fn<Promise<Response>, ArgsDoFetch>(
      (...[, init]) =>
        new Promise<Response>((_resolve, rejeitar) => {
          init?.signal?.addEventListener('abort', () =>
            rejeitar(init.signal?.reason),
          )
        }),
    )
    const inicio = Date.now()
    expect(
      await exigirAdmin({ obterToken: linkado(), fetch: buscar, prazoMs: 50 }),
    ).toBeNull()
    expect(Date.now() - inicio).toBeLessThan(2000)
  })

  it('nunca escreve o token no console', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (nivel) => jest.spyOn(console, nivel).mockImplementation(() => {}),
    )
    await exigirAdmin({ obterToken: linkado(), fetch: github(401, {}) })
    await exigirAdmin({
      obterToken: linkado(),
      fetch: jest.fn(async () => {
        throw new Error('falhou')
      }),
    })
    for (const espiao of espioes) {
      expect(JSON.stringify(espiao.mock.calls)).not.toContain('token-de-teste')
    }
  })
})
