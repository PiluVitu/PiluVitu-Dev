import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { describe, expect, test } from 'vitest'
import app from '../index'
import {
  criarAutenticadorFalso,
  type AutenticadorFalso,
} from '../test-support/autenticador-falso'
import { tentarLoginGoogle } from '../test-support/login-google-falso'
import { getAuth, type AuthBindings } from './auth'
import { metodoLoginDaSessao, passkeyAmbiente } from './passkey'

const URL_DEV = 'http://localhost:8787'
const URL_PROD = 'https://ramielle.piluvitu.com.br'
const SECRET_TESTE = 'a'.repeat(32)
const ADMIN = 'admin@example.com'
const ORIGEM_DEV = 'http://localhost:3333'

// Um objeto novo por teste: o rate limit em memória é por instância de
// `getAuth`, que é memoizada pela identidade do `env`.
function envDeTeste(extra: Partial<AuthBindings> = {}): AuthBindings {
  return {
    DB: env.DB,
    BETTER_AUTH_URL: URL_DEV,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: ADMIN,
    ...extra,
  }
}

/**
 * Sessão real no mesmo D1, criada por uma instância só do teste com
 * `emailAndPassword` ligado (mesma técnica de `session.test.ts`). Em
 * produção o login é só Google; aqui só importa existir uma sessão válida.
 */
async function cookieDeSessao(email: string, baseURL = URL_DEV) {
  const authDeTeste = betterAuth({
    database: env.DB,
    baseURL,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })
  const res = await authDeTeste.api.signUpEmail({
    body: { email, password: 'senha-forte-123', name: email },
    asResponse: true,
  })
  const cookie = res.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie')
  return cookie
}

/** Junta o `cookie` de entrada com os `Set-Cookie` da resposta. */
function comCookies(cookie: string, res: Response): string {
  const novos = res.headers.getSetCookie().map((c) => c.split(';')[0])
  return [cookie, ...novos].filter((c) => c.length > 0).join('; ')
}

async function pedir(
  e: AuthBindings,
  caminho: string,
  init: {
    method?: string
    cookie?: string
    origin?: string
    body?: unknown
  } = {},
) {
  const headers: Record<string, string> = {}
  if (init.cookie) headers.cookie = init.cookie
  if (init.origin) headers.origin = init.origin
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  return app.request(
    `/api/auth/passkey/${caminho}`,
    {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    e,
  )
}

type Notificacao = { code: string; message: string }
type Envelope = { ok: boolean; notifications: Notificacao[] }

async function cadastrarPasskey(
  e: AuthBindings,
  sessao: string,
  autenticador: AutenticadorFalso,
  origem = ORIGEM_DEV,
  verificouUsuario = true,
) {
  const opcoes = await pedir(e, 'generate-register-options', { cookie: sessao })
  expect(opcoes.status).toBe(200)
  const { challenge } = (await opcoes.json()) as { challenge: string }
  const resposta = await autenticador.registrar({
    challenge,
    origin: origem,
    rpID: 'localhost',
    verificouUsuario,
  })
  return pedir(e, 'verify-registration', {
    method: 'POST',
    cookie: comCookies(sessao, opcoes),
    origin: origem,
    body: { response: resposta, name: 'Notebook' },
  })
}

async function entrarComPasskey(
  e: AuthBindings,
  autenticador: AutenticadorFalso,
  origem = ORIGEM_DEV,
  verificouUsuario = true,
) {
  const opcoes = await pedir(e, 'generate-authenticate-options')
  expect(opcoes.status).toBe(200)
  const { challenge } = (await opcoes.json()) as { challenge: string }
  const resposta = await autenticador.autenticar({
    challenge,
    origin: origem,
    rpID: 'localhost',
    verificouUsuario,
  })
  return pedir(e, 'verify-authentication', {
    method: 'POST',
    cookie: comCookies('', opcoes),
    origin: origem,
    body: { response: resposta },
  })
}

async function contar(tabela: 'passkey' | 'session') {
  const linha = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${tabela}`,
  ).first<{
    n: number
  }>()
  return linha?.n ?? 0
}

describe('passkeyAmbiente — rpID e origin saem da config (BETTER_AUTH_URL), nunca do pedido', () => {
  test('ramielle de produção: rpID piluvitu.com.br, origin do apps/web de produção', () => {
    expect(passkeyAmbiente(URL_PROD)).toEqual({
      rpID: 'piluvitu.com.br',
      origin: 'https://piluvitu.com.br',
    })
  })

  test.each(['http://localhost:8788', 'http://127.0.0.1:8788'])(
    'dev (%s): rpID localhost, origin do apps/web de dev',
    (url) => {
      expect(passkeyAmbiente(url)).toEqual({
        rpID: 'localhost',
        origin: 'http://localhost:3333',
      })
    },
  )

  test.each([
    'https://outro.example.com',
    'http://ramielle.piluvitu.com.br', // produção sem https não é produção
    'https://piluvitu.com.br',
    'https://ramielle.piluvitu.com.br.evil.com',
    'não é url',
    '',
    undefined,
  ])('ambiente desconhecido (%p) desliga a passkey', (url) => {
    expect(passkeyAmbiente(url)).toBeNull()
  })
})

describe('plugin desligado fora dos ambientes conhecidos (fail-closed)', () => {
  test('as rotas de passkey nem existem', async () => {
    const e = envDeTeste({ BETTER_AUTH_URL: 'https://outro.example.com' })
    const res = await pedir(e, 'generate-authenticate-options')
    expect(res.status).toBe(404)
  })
})

describe('cadastro de passkey — só admin, com sessão', () => {
  test('sem sessão: 401 not_authenticated no envelope', async () => {
    const res = await pedir(envDeTeste(), 'generate-register-options')
    expect(res.status).toBe(401)
    const corpo = (await res.json()) as Envelope
    expect(corpo.ok).toBe(false)
    expect(corpo.notifications[0].code).toBe('not_authenticated')
  })

  test('sessão de quem não é admin (votação é livre, passkey não): 403 admin_only', async () => {
    const sessao = await cookieDeSessao('votante@example.com')
    for (const caminho of ['generate-register-options', 'list-user-passkeys']) {
      const res = await pedir(envDeTeste(), caminho, { cookie: sessao })
      expect(res.status).toBe(403)
      const corpo = (await res.json()) as Envelope
      expect(corpo.notifications[0].code).toBe('admin_only')
    }
    for (const caminho of [
      'verify-registration',
      'delete-passkey',
      'update-passkey',
    ]) {
      const res = await pedir(envDeTeste(), caminho, {
        method: 'POST',
        cookie: sessao,
        origin: ORIGEM_DEV,
        body: { id: 'x', name: 'x', response: {} },
      })
      expect(res.status).toBe(403)
    }
  })

  test('admin recebe opções com rp.id fixo e verificação do usuário obrigatória', async () => {
    const sessao = await cookieDeSessao(ADMIN)
    const res = await pedir(envDeTeste(), 'generate-register-options', {
      cookie: sessao,
    })
    expect(res.status).toBe(200)
    const opcoes = (await res.json()) as {
      rp: { id: string; name: string }
      authenticatorSelection: { residentKey: string; userVerification: string }
    }
    expect(opcoes.rp).toEqual({ id: 'localhost', name: 'PiluVitu' })
    expect(opcoes.authenticatorSelection.residentKey).toBe('required')
    expect(opcoes.authenticatorSelection.userVerification).toBe('required')
  })

  // O plugin fixa `preferred` nas opções de login; sem reescrever, um
  // autenticador assina sem biometria/PIN e o servidor só recusa depois (401).
  test('opções de login pedem verificação do usuário (UV) required, com rpId fixo', async () => {
    const res = await pedir(envDeTeste(), 'generate-authenticate-options')
    expect(res.status).toBe(200)
    const opcoes = (await res.json()) as {
      rpId: string
      userVerification: string
      challenge: string
    }
    expect(opcoes.userVerification).toBe('required')
    expect(opcoes.rpId).toBe('localhost')
    expect(opcoes.challenge.length).toBeGreaterThan(0)
  })

  test('em produção o rp.id é piluvitu.com.br', async () => {
    const sessao = await cookieDeSessao(ADMIN, URL_PROD)
    const res = await pedir(
      envDeTeste({ BETTER_AUTH_URL: URL_PROD }),
      'generate-register-options',
      { cookie: sessao },
    )
    expect(res.status).toBe(200)
    const opcoes = (await res.json()) as { rp: { id: string } }
    expect(opcoes.rp.id).toBe('piluvitu.com.br')
  })
})

describe('ponta a ponta com autenticador falso (a conferência roda no workerd)', () => {
  test('admin cadastra, lista, e entra com a passkey sem Google', async () => {
    const e = envDeTeste()
    const sessao = await cookieDeSessao(ADMIN)
    const autenticador = await criarAutenticadorFalso()

    const cadastro = await cadastrarPasskey(e, sessao, autenticador)
    expect(cadastro.status).toBe(200)
    expect(await contar('passkey')).toBe(1)

    const lista = await pedir(e, 'list-user-passkeys', { cookie: sessao })
    expect(lista.status).toBe(200)
    const passkeys = (await lista.json()) as Array<{
      name: string
      credentialID: string
      backedUp: boolean
    }>
    expect(passkeys).toHaveLength(1)
    expect(passkeys[0].name).toBe('Notebook')
    expect(passkeys[0].credentialID).toBe(autenticador.credentialId)

    const sessoesAntes = await contar('session')
    const login = await entrarComPasskey(e, autenticador)
    expect(login.status).toBe(200)
    expect(await contar('session')).toBe(sessoesAntes + 1)
    const cookieNovo = login.headers
      .getSetCookie()
      .find((c) => c.startsWith('better-auth.session_token='))
    expect(cookieNovo).toBeDefined()

    // A sessão aberta pela passkey serve no guard de admin de sempre.
    const me = await app.request(
      '/auth/me',
      { headers: { cookie: cookieNovo!.split(';')[0] } },
      e,
    )
    expect(me.status).toBe(200)
  })

  test('admin remove a própria passkey e ela deixa de entrar', async () => {
    const e = envDeTeste()
    const sessao = await cookieDeSessao(ADMIN)
    const autenticador = await criarAutenticadorFalso()
    expect((await cadastrarPasskey(e, sessao, autenticador)).status).toBe(200)

    const lista = (await (
      await pedir(e, 'list-user-passkeys', { cookie: sessao })
    ).json()) as Array<{ id: string }>
    const remocao = await pedir(e, 'delete-passkey', {
      method: 'POST',
      cookie: sessao,
      origin: ORIGEM_DEV,
      body: { id: lista[0].id },
    })
    expect(remocao.status).toBe(200)
    expect(await contar('passkey')).toBe(0)

    const login = await entrarComPasskey(e, autenticador)
    expect(login.status).toBe(401)
  })

  test('quem saiu do ADMIN_EMAILS depois de cadastrar não entra por passkey, e nenhuma sessão é criada', async () => {
    const sessao = await cookieDeSessao(ADMIN)
    const autenticador = await criarAutenticadorFalso()
    expect(
      (await cadastrarPasskey(envDeTeste(), sessao, autenticador)).status,
    ).toBe(200)

    const semAdmin = envDeTeste({ ADMIN_EMAILS: 'outra-pessoa@example.com' })
    const sessoesAntes = await contar('session')
    const login = await entrarComPasskey(semAdmin, autenticador)
    expect(login.status).toBe(403)
    expect(login.headers.getSetCookie().join(';')).not.toContain(
      'session_token=',
    )
    expect(await contar('session')).toBe(sessoesAntes)
  })

  test('assertion sem verificação do usuário (UV) é recusada', async () => {
    const e = envDeTeste()
    const autenticador = await criarAutenticadorFalso()
    expect(
      (await cadastrarPasskey(e, await cookieDeSessao(ADMIN), autenticador))
        .status,
    ).toBe(200)
    const sessoesAntes = await contar('session')
    const login = await entrarComPasskey(e, autenticador, ORIGEM_DEV, false)
    expect(login.status).toBe(401)
    expect(await contar('session')).toBe(sessoesAntes)
  })

  test('cadastro sem verificação do usuário (UV) é recusado', async () => {
    const res = await cadastrarPasskey(
      envDeTeste(),
      await cookieDeSessao(ADMIN),
      await criarAutenticadorFalso(),
      ORIGEM_DEV,
      false,
    )
    expect(res.status).toBe(401)
    expect(await contar('passkey')).toBe(0)
  })

  // A segunda origem é confiável para o Better Auth (trustedOrigins/CORS),
  // então o pedido chega ao plugin; sem `origin` fixo, ele aceitaria o
  // header Origin do próprio pedido e o cadastro passaria.
  test('Origin forjado no pedido não muda a origem esperada', async () => {
    const e = envDeTeste({
      CORS_ALLOWED_ORIGINS: `${ORIGEM_DEV},http://localhost:4444`,
    })
    const sessao = await cookieDeSessao(ADMIN)
    const autenticador = await criarAutenticadorFalso()

    const cadastro = await cadastrarPasskey(
      e,
      sessao,
      autenticador,
      'http://localhost:4444',
    )
    expect(cadastro.status).toBe(500)
    expect(((await cadastro.json()) as Notificacao).code).toBe(
      'FAILED_TO_VERIFY_REGISTRATION',
    )
    expect(await contar('passkey')).toBe(0)

    expect((await cadastrarPasskey(e, sessao, autenticador)).status).toBe(200)
    const login = await entrarComPasskey(
      e,
      autenticador,
      'http://localhost:4444',
    )
    expect(login.status).toBe(400)
    expect(((await login.json()) as Notificacao).code).toBe(
      'AUTHENTICATION_FAILED',
    )
  })
})

/** Cookie da sessão do `Set-Cookie` de uma resposta de login. */
function cookieDaSessao(res: Response): string {
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith('better-auth.session_token='))
  if (!cookie) throw new Error('login não devolveu cookie de sessão')
  return cookie.split(';')[0]
}

async function metodoDaUltimaSessao() {
  const linha = await env.DB.prepare(
    'SELECT metodoLogin FROM session ORDER BY createdAt DESC LIMIT 1',
  ).first<{ metodoLogin: string | null }>()
  return linha?.metodoLogin
}

async function entrarPeloGoogle(e: AuthBindings, ip: string) {
  const res = await tentarLoginGoogle(
    getAuth(e),
    e.BETTER_AUTH_URL,
    { sub: 'sub-admin', email: ADMIN, name: 'Admin' },
    ip,
  )
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).not.toContain('error=')
  return cookieDaSessao(res)
}

describe('metodoLoginDaSessao — só o login Google sai como google', () => {
  test.each([
    [{ path: '/passkey/verify-authentication' }, 'passkey'],
    [{ path: '/callback/:id', params: { id: 'google' } }, 'google'],
    [{ path: '/sign-in/social', body: { provider: 'google' } }, 'google'],
    [{ path: '/callback/:id', params: { id: 'github' } }, '/callback/:id'],
    [
      { path: '/sign-in/social', body: { provider: 'github' } },
      '/sign-in/social',
    ],
    [{ path: '/sign-up/email' }, '/sign-up/email'],
    [{}, 'desconhecido'],
    [null, 'desconhecido'],
  ])('%j → %s', (ctx, esperado) => {
    expect(metodoLoginDaSessao(ctx)).toBe(esperado)
  })
})

// Regra do dono: a passkey só se cadastra com sessão aberta pelo Google de
// um e-mail permitido. Sem isto, uma passkey (perdida, emprestada) abriria
// uma sessão capaz de cadastrar OUTRA, e remover a original não bastaria.
describe('cadastro de passkey exige sessão aberta pelo Google', () => {
  test('sessão aberta pela passkey não gera opções nem verifica cadastro: 403 PASSKEY_EXIGE_LOGIN_GOOGLE', async () => {
    const e = envDeTeste()
    const autenticador = await criarAutenticadorFalso()
    expect(
      (await cadastrarPasskey(e, await cookieDeSessao(ADMIN), autenticador))
        .status,
    ).toBe(200)

    const login = await entrarComPasskey(e, autenticador)
    expect(login.status).toBe(200)
    const sessaoPasskey = cookieDaSessao(login)
    expect(await metodoDaUltimaSessao()).toBe('passkey')

    const opcoes = await pedir(e, 'generate-register-options', {
      cookie: sessaoPasskey,
    })
    expect(opcoes.status).toBe(403)
    const corpo = (await opcoes.json()) as Envelope
    expect(corpo.ok).toBe(false)
    expect(corpo.notifications[0]).toMatchObject({
      code: 'PASSKEY_EXIGE_LOGIN_GOOGLE',
      message: 'Para cadastrar uma passkey, entre pelo Google',
    })

    // O desafio de outra sessão não ajuda: a verificação também recusa.
    const outra = await criarAutenticadorFalso()
    const resposta = await outra.registrar({
      challenge: 'qualquer',
      origin: ORIGEM_DEV,
      rpID: 'localhost',
      verificouUsuario: true,
    })
    const verificacao = await pedir(e, 'verify-registration', {
      method: 'POST',
      cookie: sessaoPasskey,
      origin: ORIGEM_DEV,
      body: { response: resposta, name: 'Intruso' },
    })
    expect(verificacao.status).toBe(403)
    expect(((await verificacao.json()) as Envelope).notifications[0].code).toBe(
      'PASSKEY_EXIGE_LOGIN_GOOGLE',
    )
    expect(await contar('passkey')).toBe(1)
  })

  test('sessão aberta pela passkey ainda lista e remove (remover não amplia acesso)', async () => {
    const e = envDeTeste()
    const autenticador = await criarAutenticadorFalso()
    expect(
      (await cadastrarPasskey(e, await cookieDeSessao(ADMIN), autenticador))
        .status,
    ).toBe(200)
    const sessaoPasskey = cookieDaSessao(
      await entrarComPasskey(e, autenticador),
    )

    const lista = await pedir(e, 'list-user-passkeys', {
      cookie: sessaoPasskey,
    })
    expect(lista.status).toBe(200)
    const [passkey] = (await lista.json()) as Array<{ id: string }>

    const remocao = await pedir(e, 'delete-passkey', {
      method: 'POST',
      cookie: sessaoPasskey,
      origin: ORIGEM_DEV,
      body: { id: passkey.id },
    })
    expect(remocao.status).toBe(200)
    expect(await contar('passkey')).toBe(0)
  })

  test('sessão aberta pelo Google é marcada e cadastra', async () => {
    const e = envDeTeste()
    const sessaoGoogle = await entrarPeloGoogle(e, '203.0.113.40')
    expect(await metodoDaUltimaSessao()).toBe('google')

    const cadastro = await cadastrarPasskey(
      e,
      sessaoGoogle,
      await criarAutenticadorFalso(),
    )
    expect(cadastro.status).toBe(200)
    expect(await contar('passkey')).toBe(1)
  })

  // Antes deste PR o Google era o único jeito de entrar: a sessão que já
  // existia em produção (metodoLogin NULL) foi aberta por ele.
  test('sessão antiga, sem método gravado (NULL), cadastra', async () => {
    const e = envDeTeste()
    const sessao = await cookieDeSessao(ADMIN)
    expect(await metodoDaUltimaSessao()).toBeNull()

    const cadastro = await cadastrarPasskey(
      e,
      sessao,
      await criarAutenticadorFalso(),
    )
    expect(cadastro.status).toBe(200)
  })

  test('o cliente não escolhe o método: metodoLogin fica fora do input', async () => {
    const e = envDeTeste()
    const autenticador = await criarAutenticadorFalso()
    expect(
      (await cadastrarPasskey(e, await cookieDeSessao(ADMIN), autenticador))
        .status,
    ).toBe(200)
    const sessaoPasskey = cookieDaSessao(
      await entrarComPasskey(e, autenticador),
    )

    await app.request(
      '/api/auth/update-session',
      {
        method: 'POST',
        headers: {
          cookie: sessaoPasskey,
          origin: ORIGEM_DEV,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ metodoLogin: 'google' }),
      },
      e,
    )
    expect(await metodoDaUltimaSessao()).toBe('passkey')
    const opcoes = await pedir(e, 'generate-register-options', {
      cookie: sessaoPasskey,
    })
    expect(opcoes.status).toBe(403)
  })
})

describe('CORS — o apps/web de produção chega nas rotas de passkey com credenciais', () => {
  test.each(['verify-authentication', 'verify-registration', 'delete-passkey'])(
    'preflight de POST %s a partir de https://piluvitu.com.br',
    async (caminho) => {
      const res = await app.request(
        `/api/auth/passkey/${caminho}`,
        {
          method: 'OPTIONS',
          headers: {
            origin: 'https://piluvitu.com.br',
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type',
          },
        },
        envDeTeste({
          BETTER_AUTH_URL: URL_PROD,
          CORS_ALLOWED_ORIGINS: 'https://piluvitu.com.br',
        }),
      )
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBe(
        'https://piluvitu.com.br',
      )
      expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    },
  )
})
