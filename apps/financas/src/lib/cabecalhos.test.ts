import { env } from 'cloudflare:test'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { app, type Bindings } from '../index'
import { getAuth } from './auth'
import { criarAutenticadorFalso } from './autenticador-falso'
import { tentarLoginGoogle } from './login-google-falso'

// O Worker só vê /api/* (run_worker_first); a SPA ganha os cabeçalhos dela pelo
// web/public/_headers. Aqui é a superfície da API, montada de verdade (app).

const DEV = 'http://localhost:5273'
const DONO = 'dono@exemplo.com'

const CSP_API =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

function envDeTeste(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB: env.DB,
    BETTER_AUTH_URL: DEV,
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ALLOWED_EMAIL: DONO,
    ...extra,
  }
}

// O Map do rate limit do Better Auth é singleton de módulo: IP novo por
// chamada. 192.0.2.0/24 é TEST-NET-1 (RFC 5737), fora dos que outras suítes usam.
let ultimoIp = 0
const novoIp = () => `192.0.2.${++ultimoIp}`

function esperarCabecalhosDaApi(res: Response, csp = CSP_API) {
  expect(res.headers.get('content-security-policy')).toBe(csp)
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('x-frame-options')).toBe('DENY')
  expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  expect(res.headers.get('strict-transport-security')).toBe(
    'max-age=15552000; includeSubDomains',
  )
  expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
  expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  expect(res.headers.get('x-powered-by')).toBeNull()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cabeçalhos de segurança da API (secureHeaders)', () => {
  test('resposta de sucesso: GET /api/health', async () => {
    const res = await app.request('/api/health', {}, envDeTeste())
    expect(res.status).toBe(200)
    esperarCabecalhosDaApi(res)
  })

  test('401 da guarda de sessão', async () => {
    const res = await app.request('/api/accounts', {}, envDeTeste())
    expect(res.status).toBe(401)
    esperarCabecalhosDaApi(res)
  })

  test('404 do catch-all', async () => {
    const res = await app.request(
      '/api/health',
      { method: 'POST' },
      envDeTeste(),
    )
    expect(res.status).toBe(404)
    expect(
      ((await res.json()) as { notifications: { code: string }[] })
        .notifications[0]?.code,
    ).toBe('not_found')
    esperarCabecalhosDaApi(res)
  })

  test('envelope de erro do onError global (createAuth lança sem BETTER_AUTH_SECRET)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request(
      '/api/auth/get-session',
      {},
      envDeTeste({ BETTER_AUTH_SECRET: '' }),
    )
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      ok: false,
      data: null,
      notifications: [
        {
          type: 'error',
          code: 'internal_error',
          message: 'erro interno — tente novamente',
        },
      ],
    })
    esperarCabecalhosDaApi(res)
  })

  test('rota do Better Auth: GET /api/auth/get-session sem cookie segue 200 com null', async () => {
    const res = await app.request('/api/auth/get-session', {}, envDeTeste())
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
    esperarCabecalhosDaApi(res)
  })

  test('OPTIONS não muda: não há CORS, cai na guarda como antes', async () => {
    const res = await app.request(
      '/api/accounts',
      { method: 'OPTIONS' },
      envDeTeste(),
    )
    expect(res.status).toBe(401)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    esperarCabecalhosDaApi(res)
  })
})

describe('a página HTML de erro do Better Auth (/api/auth/error)', () => {
  test('é HTML com <style> e style="" inline e nenhum <script>: só ela ganha style-src unsafe-inline', async () => {
    const res = await app.request(
      '/api/auth/error?error=state_mismatch',
      {},
      envDeTeste(),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<style>')
    expect(html).toContain('style="')
    expect(html).not.toMatch(/<script/i)
    esperarCabecalhosDaApi(
      res,
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'",
    )
  })

  test('o callback do OAuth sem state redireciona para ela (o caminho real até a página)', async () => {
    const res = await app.request(
      `${DEV}/api/auth/callback/google?code=x`,
      { headers: { 'cf-connecting-ip': novoIp() } },
      envDeTeste(),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/api/auth/error')
    esperarCabecalhosDaApi(res)
  })
})

describe('o login segue funcionando atrás dos cabeçalhos', () => {
  test('Google: o callback 302 volta para a SPA com o cookie de sessão intacto', async () => {
    const e = envDeTeste()
    const res = await tentarLoginGoogle(
      getAuth(e),
      DEV,
      { sub: 'sub-dono', email: DONO, name: 'Dono' },
      novoIp(),
      (req) => app.request(req, undefined, e),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    const sessao = res.headers
      .getSetCookie()
      .find((c) => c.startsWith('better-auth.session_token='))
    expect(sessao).toBeDefined()
    expect(sessao).toMatch(/HttpOnly/i)
    expect(sessao).toMatch(/SameSite=Lax/i)
    esperarCabecalhosDaApi(res)

    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const contas = await app.request(
      '/api/accounts',
      { headers: { cookie } },
      e,
    )
    expect(contas.status).toBe(200)
    esperarCabecalhosDaApi(contas)
  })

  test('passkey: cadastrar e entrar de ponta a ponta pelo app montado', async () => {
    const e = envDeTeste()
    const ip = novoIp()
    const login = await tentarLoginGoogle(
      getAuth(e),
      DEV,
      { sub: 'sub-dono', email: DONO, name: 'Dono' },
      ip,
      (req) => app.request(req, undefined, e),
    )
    const cookieGoogle = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')

    const pedir = (
      metodo: 'GET' | 'POST',
      caminho: string,
      o: { cookie?: string; body?: unknown } = {},
    ) => {
      const headers = new Headers({ 'cf-connecting-ip': ip })
      if (o.cookie) headers.set('cookie', o.cookie)
      if (metodo === 'POST') {
        headers.set('content-type', 'application/json')
        headers.set('origin', DEV)
      }
      return app.request(
        `${DEV}/api/auth${caminho}`,
        {
          method: metodo,
          headers,
          body: o.body === undefined ? undefined : JSON.stringify(o.body),
        },
        e,
      )
    }

    const aut = await criarAutenticadorFalso()
    const opcoesCadastro = await pedir(
      'GET',
      '/passkey/generate-register-options',
      { cookie: cookieGoogle },
    )
    expect(opcoesCadastro.status).toBe(200)
    esperarCabecalhosDaApi(opcoesCadastro)
    const cookieCadastro = [
      cookieGoogle,
      ...opcoesCadastro.headers.getSetCookie().map((c) => c.split(';')[0]),
    ].join('; ')
    const { challenge: desafioCadastro } = (await opcoesCadastro.json()) as {
      challenge: string
    }
    const cadastro = await pedir('POST', '/passkey/verify-registration', {
      cookie: cookieCadastro,
      body: {
        response: await aut.registrar(desafioCadastro, {
          origin: DEV,
          rpID: 'localhost',
        }),
        name: 'Notebook',
      },
    })
    expect(cadastro.status).toBe(200)
    esperarCabecalhosDaApi(cadastro)

    const opcoesEntrada = await pedir(
      'GET',
      '/passkey/generate-authenticate-options',
    )
    expect(opcoesEntrada.status).toBe(200)
    esperarCabecalhosDaApi(opcoesEntrada)
    const cookieEntrada = opcoesEntrada.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const { challenge: desafioEntrada } = (await opcoesEntrada.json()) as {
      challenge: string
    }
    const entrada = await pedir('POST', '/passkey/verify-authentication', {
      cookie: cookieEntrada,
      body: {
        response: await aut.autenticar(desafioEntrada, {
          origin: DEV,
          rpID: 'localhost',
        }),
      },
    })
    expect(entrada.status).toBe(200)
    expect(
      entrada.headers
        .getSetCookie()
        .some((c) => c.startsWith('better-auth.session_token=')),
    ).toBe(true)
    esperarCabecalhosDaApi(entrada)
  })
})
