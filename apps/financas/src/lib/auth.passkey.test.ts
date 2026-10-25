import { env, SELF } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import { configPasskey, createAuth, type AuthBindings } from './auth'
import { criarAutenticadorFalso } from './autenticador-falso'
import { tentarLoginGoogle } from './login-google-falso'

const DONO = 'dono@exemplo.com'
const DEV = 'http://localhost:5273'
const PROD = 'https://financas.piluvitu.com.br'

function envCom(extra: Partial<AuthBindings> = {}): AuthBindings {
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

// O Map do rate limit em memória é singleton de módulo (ver CLAUDE.md,
// "Better Auth — factory"): IP novo por teste, senão as contagens se somam.
// 198.51.100.0/24 é TEST-NET-2 (RFC 5737).
let ultimoIp = 0
const novoIp = () => `198.51.100.${++ultimoIp}`

class Jarra {
  private cookies = new Map<string, string>()
  absorver(headers: Headers) {
    for (const c of headers.getSetCookie()) {
      const [par] = c.split(';')
      const i = par!.indexOf('=')
      this.cookies.set(par!.slice(0, i), par!.slice(i + 1))
    }
  }
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

type Auth = ReturnType<typeof createAuth>

async function chamar(
  auth: Auth,
  metodo: 'GET' | 'POST',
  caminho: string,
  o: {
    jarra?: Jarra
    ip: string
    base?: string
    body?: unknown
    origin?: string | null
    referer?: string
  },
): Promise<Response> {
  const headers = new Headers({ 'cf-connecting-ip': o.ip })
  const cookie = o.jarra?.header()
  if (cookie) headers.set('cookie', cookie)
  if (metodo === 'POST') {
    headers.set('content-type', 'application/json')
    if (o.origin !== null) headers.set('origin', o.origin ?? DEV)
  }
  if (o.referer) headers.set('referer', o.referer)
  const res = await auth.handler(
    new Request(`${o.base ?? DEV}/api/auth${caminho}`, {
      method: metodo,
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    }),
  )
  o.jarra?.absorver(res.headers)
  return res
}

async function sessaoDoGoogle(auth: Auth, ip: string, email = DONO) {
  const jarra = new Jarra()
  const res = await tentarLoginGoogle(
    auth,
    DEV,
    { sub: `sub-${email}`, email, name: 'Dono' },
    ip,
  )
  expect(res.status).toBe(302)
  jarra.absorver(res.headers)
  return jarra
}

type Autenticador = Awaited<ReturnType<typeof criarAutenticadorFalso>>

async function cadastrar(
  auth: Auth,
  jarra: Jarra,
  ip: string,
  aut: Autenticador,
  o: { uv?: boolean } = {},
) {
  const opcoes = await chamar(
    auth,
    'GET',
    '/passkey/generate-register-options',
    {
      jarra,
      ip,
    },
  )
  expect(opcoes.status).toBe(200)
  const { challenge } = (await opcoes.json()) as { challenge: string }
  const response = await aut.registrar(challenge, {
    origin: DEV,
    rpID: 'localhost',
    uv: o.uv,
  })
  return chamar(auth, 'POST', '/passkey/verify-registration', {
    jarra,
    ip,
    body: { response, name: 'Notebook' },
  })
}

async function entrarComPasskey(
  auth: Auth,
  aut: Autenticador,
  ip: string,
  o: {
    uv?: boolean
    originNoCliente?: string
    origin?: string | null
    referer?: string
  } = {},
) {
  const jarra = new Jarra()
  const opcoes = await chamar(
    auth,
    'GET',
    '/passkey/generate-authenticate-options',
    { jarra, ip },
  )
  expect(opcoes.status).toBe(200)
  const { challenge } = (await opcoes.json()) as { challenge: string }
  const response = await aut.autenticar(challenge, {
    origin: o.originNoCliente ?? DEV,
    rpID: 'localhost',
    uv: o.uv,
  })
  const res = await chamar(auth, 'POST', '/passkey/verify-authentication', {
    jarra,
    ip,
    body: { response },
    origin: o.origin,
    referer: o.referer,
  })
  return { res, jarra }
}

async function contar(tabela: 'session' | 'passkey'): Promise<number> {
  const linha = await env.DB.prepare(
    `SELECT count(*) AS n FROM ${tabela}`,
  ).first<{ n: number }>()
  return linha?.n ?? -1
}

function temCookieDeSessao(res: Response): boolean {
  return res.headers
    .getSetCookie()
    .some((c) => c.includes('session_token=') && !c.includes('Max-Age=0'))
}

describe('configPasskey — rpID e origin fixos por ambiente', () => {
  test('produção', () => {
    expect(configPasskey(PROD)).toEqual({
      rpID: 'financas.piluvitu.com.br',
      origin: PROD,
    })
  })

  test('dev (Vite em :5273, o BETTER_AUTH_URL do .dev.vars.example)', () => {
    expect(configPasskey(DEV)).toEqual({ rpID: 'localhost', origin: DEV })
  })

  test.each([
    ['http://localhost:8787'],
    ['https://financas.piluvitu.com.br/'],
    ['http://financas.piluvitu.com.br'],
    ['https://evil.example'],
    [''],
    [undefined as unknown as string],
    ['__proto__'],
    ['toString'],
  ])('ambiente desconhecido (%o) desliga a passkey', (baseURL) => {
    expect(configPasskey(baseURL)).toBeNull()
  })
})

describe('plugin desligado fora dos ambientes conhecidos', () => {
  test('as rotas /passkey/* nem existem (404)', async () => {
    const auth = createAuth(
      envCom({ BETTER_AUTH_URL: 'http://localhost:8787' }),
    )
    const res = await chamar(
      auth,
      'GET',
      '/passkey/generate-authenticate-options',
      { ip: novoIp(), base: 'http://localhost:8787' },
    )
    expect(res.status).toBe(404)
  })
})

describe('opções da cerimônia', () => {
  test('produção: rpID é o domínio fixo, mesmo com o pedido chegando por outro host', async () => {
    const auth = createAuth(envCom({ BETTER_AUTH_URL: PROD }))
    const res = await auth.handler(
      new Request(
        'https://evil.example/api/auth/passkey/generate-authenticate-options',
        {
          headers: {
            'cf-connecting-ip': novoIp(),
            host: 'evil.example',
            origin: 'https://evil.example',
          },
        },
      ),
    )
    expect(res.status).toBe(200)
    const corpo = (await res.json()) as {
      rpId: string
      userVerification: string
    }
    expect(corpo.rpId).toBe('financas.piluvitu.com.br')
  })

  test('cadastro pede credencial descobrível e verificação do usuário', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const jarra = await sessaoDoGoogle(auth, ip)
    const res = await chamar(
      auth,
      'GET',
      '/passkey/generate-register-options',
      {
        jarra,
        ip,
      },
    )
    expect(res.status).toBe(200)
    const corpo = (await res.json()) as {
      rp: { id: string; name: string }
      authenticatorSelection: { residentKey: string; userVerification: string }
    }
    expect(corpo.rp).toEqual({ id: 'localhost', name: 'Finanças PiluVitu' })
    expect(corpo.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    })
  })
})

describe('cadastro de passkey exige sessão de e-mail permitido', () => {
  test('sem sessão: 401 e nada gravado', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const opcoes = await chamar(
      auth,
      'GET',
      '/passkey/generate-register-options',
      { ip },
    )
    expect(opcoes.status).toBe(401)
    const lista = await chamar(auth, 'GET', '/passkey/list-user-passkeys', {
      ip,
    })
    expect(lista.status).toBe(401)
  })

  test('sessão de e-mail que saiu da lista: 403 email_not_allowed em cadastro, lista e remoção', async () => {
    const ip = novoIp()
    const jarra = await sessaoDoGoogle(createAuth(envCom()), ip)
    const authTrocada = createAuth(
      envCom({ ALLOWED_EMAIL: 'outro@exemplo.com' }),
    )

    for (const [metodo, caminho, body] of [
      ['GET', '/passkey/generate-register-options', undefined],
      ['POST', '/passkey/verify-registration', { response: {} }],
      ['GET', '/passkey/list-user-passkeys', undefined],
      ['POST', '/passkey/delete-passkey', { id: 'qualquer' }],
      ['POST', '/passkey/update-passkey', { id: 'qualquer', name: 'x' }],
    ] as const) {
      const res = await chamar(authTrocada, metodo, caminho, {
        jarra,
        ip,
        body,
      })
      expect(res.status, caminho).toBe(403)
      expect(((await res.json()) as { code: string }).code, caminho).toBe(
        'email_not_allowed',
      )
    }
    expect(await contar('passkey')).toBe(0)
  })
})

describe('ponta a ponta com autenticador ES256 falso', () => {
  test('cadastra, lista, entra sem Google e remove', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const jarra = await sessaoDoGoogle(auth, ip)
    const aut = await criarAutenticadorFalso()

    const cadastro = await cadastrar(auth, jarra, ip, aut)
    expect(cadastro.status).toBe(200)
    expect(await contar('passkey')).toBe(1)

    const lista = await chamar(auth, 'GET', '/passkey/list-user-passkeys', {
      jarra,
      ip,
    })
    const passkeys = (await lista.json()) as Array<{
      id: string
      name: string
      credentialID: string
    }>
    expect(passkeys).toHaveLength(1)
    expect(passkeys[0]).toMatchObject({
      name: 'Notebook',
      credentialID: aut.id,
    })

    const sessoesAntes = await contar('session')
    const { res, jarra: jarraPasskey } = await entrarComPasskey(auth, aut, ip)
    expect(res.status).toBe(200)
    expect(temCookieDeSessao(res)).toBe(true)
    expect(await contar('session')).toBe(sessoesAntes + 1)

    const sessao = await chamar(auth, 'GET', '/get-session', {
      jarra: jarraPasskey,
      ip,
    })
    expect(
      ((await sessao.json()) as { user: { email: string } }).user.email,
    ).toBe(DONO)

    const remocao = await chamar(auth, 'POST', '/passkey/delete-passkey', {
      jarra,
      ip,
      body: { id: passkeys[0]!.id },
    })
    expect(remocao.status).toBe(200)
    expect(await contar('passkey')).toBe(0)
  })

  test('origin vem da config, não do pedido: sem header Origin (só Referer) a conferência ainda usa a origem fixa', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const aut = await criarAutenticadorFalso()
    expect(
      (await cadastrar(auth, await sessaoDoGoogle(auth, ip), ip, aut)).status,
    ).toBe(200)

    // Com o fallback do plugin (options.origin ausente), Origin vazio vira
    // "origin missing" (400) antes de qualquer conferência.
    const { res } = await entrarComPasskey(auth, aut, ip, {
      origin: null,
      referer: `${DEV}/`,
    })
    expect(res.status).toBe(200)
  })

  test('clientDataJSON assinado para outra origem é recusado, sem sessão', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const aut = await criarAutenticadorFalso()
    expect(
      (await cadastrar(auth, await sessaoDoGoogle(auth, ip), ip, aut)).status,
    ).toBe(200)

    const sessoesAntes = await contar('session')
    const { res } = await entrarComPasskey(auth, aut, ip, {
      originNoCliente: 'https://evil.example',
    })
    expect(res.status).toBe(400)
    expect(temCookieDeSessao(res)).toBe(false)
    expect(await contar('session')).toBe(sessoesAntes)
  })
})

describe('cadastro de passkey só com sessão aberta pelo Google', () => {
  const EXIGE_GOOGLE = 'PASSKEY_EXIGE_LOGIN_GOOGLE'

  async function metodoDaSessao(jarra: Jarra): Promise<string | null> {
    const token = decodeURIComponent(
      jarra.header().match(/session_token=([^;]+)/)![1]!,
    ).split('.')[0]
    const linha = await env.DB.prepare(
      'SELECT metodoLogin FROM session WHERE token = ?',
    )
      .bind(token)
      .first<{ metodoLogin: string | null }>()
    return linha?.metodoLogin ?? null
  }

  test('sessão aberta pela passkey não gera opções nem confirma o cadastro de outra passkey (403)', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const aut = await criarAutenticadorFalso()
    expect(
      (await cadastrar(auth, await sessaoDoGoogle(auth, ip), ip, aut)).status,
    ).toBe(200)

    const { res, jarra } = await entrarComPasskey(auth, aut, novoIp())
    expect(res.status).toBe(200)
    expect(await metodoDaSessao(jarra)).toBe('passkey')

    const ipAtaque = novoIp()
    const opcoes = await chamar(
      auth,
      'GET',
      '/passkey/generate-register-options',
      { jarra, ip: ipAtaque },
    )
    expect(opcoes.status).toBe(403)
    const corpoOpcoes = (await opcoes.json()) as {
      code: string
      message: string
    }
    expect(corpoOpcoes.code).toBe(EXIGE_GOOGLE)
    expect(corpoOpcoes.message).toBe(
      'Para cadastrar uma passkey, entre pelo Google',
    )

    const outra = await criarAutenticadorFalso()
    const verificacao = await chamar(
      auth,
      'POST',
      '/passkey/verify-registration',
      {
        jarra,
        ip: ipAtaque,
        body: {
          response: await outra.registrar('qualquer', {
            origin: DEV,
            rpID: 'localhost',
          }),
          name: 'Intruso',
        },
      },
    )
    expect(verificacao.status).toBe(403)
    expect(((await verificacao.json()) as { code: string }).code).toBe(
      EXIGE_GOOGLE,
    )
    expect(await contar('passkey')).toBe(1)
  })

  test('sessão aberta pela passkey ainda lista e remove as passkeys', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const aut = await criarAutenticadorFalso()
    expect(
      (await cadastrar(auth, await sessaoDoGoogle(auth, ip), ip, aut)).status,
    ).toBe(200)
    const { jarra } = await entrarComPasskey(auth, aut, novoIp())

    const lista = await chamar(auth, 'GET', '/passkey/list-user-passkeys', {
      jarra,
      ip,
    })
    expect(lista.status).toBe(200)
    const [passkey] = (await lista.json()) as Array<{ id: string }>
    const remocao = await chamar(auth, 'POST', '/passkey/delete-passkey', {
      jarra,
      ip,
      body: { id: passkey!.id },
    })
    expect(remocao.status).toBe(200)
    expect(await contar('passkey')).toBe(0)
  })

  test('sessão do Google é marcada como google e cadastra', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const jarra = await sessaoDoGoogle(auth, ip)
    expect(await metodoDaSessao(jarra)).toBe('google')
    expect(
      (await cadastrar(auth, jarra, ip, await criarAutenticadorFalso())).status,
    ).toBe(200)
  })

  test('sessão anterior à migração (metodoLogin NULL) foi aberta pelo Google e cadastra', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const jarra = await sessaoDoGoogle(auth, ip)
    await env.DB.prepare('UPDATE session SET metodoLogin = NULL').run()
    expect(await metodoDaSessao(jarra)).toBeNull()
    expect(
      (await cadastrar(auth, jarra, ip, await criarAutenticadorFalso())).status,
    ).toBe(200)
  })

  test('sessão com método desconhecido não cadastra', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const jarra = await sessaoDoGoogle(auth, ip)
    await env.DB.prepare("UPDATE session SET metodoLogin = 'outro'").run()
    const res = await chamar(
      auth,
      'GET',
      '/passkey/generate-register-options',
      { jarra, ip },
    )
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe(EXIGE_GOOGLE)
  })
})

describe('verificação do usuário (UV) exigida também na conferência', () => {
  test('cadastro sem UV é recusado e nada é gravado', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const res = await cadastrar(
      auth,
      await sessaoDoGoogle(auth, ip),
      ip,
      await criarAutenticadorFalso(),
      { uv: false },
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe(
      'USER_VERIFICATION_REQUIRED',
    )
    expect(await contar('passkey')).toBe(0)
  })

  test('login sem UV é recusado e não cria sessão', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const aut = await criarAutenticadorFalso()
    expect(
      (await cadastrar(auth, await sessaoDoGoogle(auth, ip), ip, aut)).status,
    ).toBe(200)

    const sessoesAntes = await contar('session')
    const { res } = await entrarComPasskey(auth, aut, ip, { uv: false })
    expect(res.status).toBe(401)
    expect(temCookieDeSessao(res)).toBe(false)
    expect(await contar('session')).toBe(sessoesAntes)
  })
})

describe('passkey nunca contorna a allowlist', () => {
  test('login por passkey de quem saiu da lista: 403 e nenhuma sessão nova', async () => {
    const ip = novoIp()
    const authDono = createAuth(envCom())
    const aut = await criarAutenticadorFalso()
    expect(
      (await cadastrar(authDono, await sessaoDoGoogle(authDono, ip), ip, aut))
        .status,
    ).toBe(200)

    const authTrocada = createAuth(
      envCom({ ALLOWED_EMAIL: 'outro@exemplo.com' }),
    )
    const sessoesAntes = await contar('session')
    const { res } = await entrarComPasskey(authTrocada, aut, ip)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe(
      'email_not_allowed',
    )
    expect(temCookieDeSessao(res)).toBe(false)
    expect(await contar('session')).toBe(sessoesAntes)
  })
})

describe('montagem no Worker', () => {
  test('/api/auth/passkey/* não cai na guarda de sessão do domínio', async () => {
    const res = await SELF.fetch(
      `${PROD}/api/auth/passkey/generate-authenticate-options`,
      { headers: { 'cf-connecting-ip': novoIp() } },
    )
    expect(res.status).toBe(200)
    expect((await res.json()) as object).toHaveProperty('challenge')
  })
})

describe('migration 0016_passkey', () => {
  test('cria passkey STRICT com as colunas do plugin, credentialID único e FK para user', async () => {
    const colunas = await env.DB.prepare('PRAGMA table_info(passkey)').all<{
      name: string
      type: string
      notnull: number
      pk: number
    }>()
    expect(
      colunas.results.map(({ name, type, notnull, pk }) => ({
        name,
        type,
        notnull,
        pk,
      })),
    ).toEqual([
      { name: 'id', type: 'TEXT', notnull: 1, pk: 1 },
      { name: 'name', type: 'TEXT', notnull: 0, pk: 0 },
      { name: 'publicKey', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'userId', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'credentialID', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'counter', type: 'INTEGER', notnull: 1, pk: 0 },
      { name: 'deviceType', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'backedUp', type: 'INTEGER', notnull: 1, pk: 0 },
      { name: 'transports', type: 'TEXT', notnull: 0, pk: 0 },
      { name: 'createdAt', type: 'TEXT', notnull: 0, pk: 0 },
      { name: 'aaguid', type: 'TEXT', notnull: 0, pk: 0 },
    ])

    const tabela = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'passkey'",
    ).first<{ sql: string }>()
    expect(tabela?.sql).toMatch(/\)\s*STRICT$/)

    const indices = await env.DB.prepare(
      "SELECT name, \"unique\" AS unico FROM pragma_index_list('passkey') WHERE origin = 'c' ORDER BY name",
    ).all<{ name: string; unico: number }>()
    expect(indices.results).toEqual([
      { name: 'passkey_credentialID_idx', unico: 1 },
      { name: 'passkey_userId_idx', unico: 0 },
    ])

    const fk = await env.DB.prepare(
      'SELECT "table" AS tabela, "from" AS de, on_delete FROM pragma_foreign_key_list(\'passkey\')',
    ).all<{ tabela: string; de: string; on_delete: string }>()
    expect(fk.results).toEqual([
      { tabela: 'user', de: 'userId', on_delete: 'CASCADE' },
    ])
  })
})

describe('migration 0016_passkey — coluna metodoLogin em session', () => {
  test('session ganha metodoLogin TEXT anulável', async () => {
    const colunas = await env.DB.prepare('PRAGMA table_info(session)').all<{
      name: string
      type: string
      notnull: number
    }>()
    expect(colunas.results.find((c) => c.name === 'metodoLogin')).toMatchObject(
      { type: 'TEXT', notnull: 0 },
    )
  })
})

describe('rate limit do login por passkey', () => {
  test('generate-authenticate-options segue o teto do /sign-in (3 a cada 10 s por IP)', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const status: number[] = []
    for (let i = 0; i < 4; i++) {
      const res = await chamar(
        auth,
        'GET',
        '/passkey/generate-authenticate-options',
        { ip },
      )
      status.push(res.status)
    }
    expect(status).toEqual([200, 200, 200, 429])
  })

  test('verify-authentication segue o mesmo teto (3 a cada 10 s por IP)', async () => {
    const auth = createAuth(envCom())
    const ip = novoIp()
    const status: number[] = []
    for (let i = 0; i < 4; i++) {
      const res = await chamar(auth, 'POST', '/passkey/verify-authentication', {
        ip,
        body: { response: {} },
      })
      status.push(res.status)
    }
    expect(status.slice(0, 3)).not.toContain(429)
    expect(status[3]).toBe(429)
  })
})
