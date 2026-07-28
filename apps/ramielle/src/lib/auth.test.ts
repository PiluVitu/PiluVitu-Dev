import { env } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import { createAuth, getAuth, isAdminEmail, type AuthBindings } from './auth'

describe('isAdminEmail — CSV de verdade, ao contrário do ALLOWED_EMAIL do finanças', () => {
  test.each([
    ['paulo.tspi@gmail.com', 'paulo.tspi@gmail.com', true],
    ['PAULO.TSPI@GMAIL.COM', 'paulo.tspi@gmail.com', true], // case-insensitive, igual ao Go
    ['  paulo.tspi@gmail.com  ', 'paulo.tspi@gmail.com', true], // trim nas duas pontas
    ['outro@gmail.com', 'paulo.tspi@gmail.com', false],
    ['a@x.com', 'a@x.com,b@x.com', true], // CSV de verdade: o Go aceita lista
    ['b@x.com', 'a@x.com,b@x.com', true],
    ['c@x.com', 'a@x.com,b@x.com', false],
    ['a@x.com', '', false], // fail-closed: sem lista, ninguém é admin
    ['a@x.com', undefined, false], // binding não setada é undefined em runtime, não ''
    [null, 'a@x.com', false],
    ['', 'a@x.com', false],
  ])('isAdminEmail(%p, %p) === %p', (email, csv, esperado) => {
    expect(isAdminEmail(email, csv)).toBe(esperado)
  })
})

const testEnv: AuthBindings = {
  DB: env.DB,
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id-de-teste',
  GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
  ADMIN_EMAILS: 'paulo.tspi@gmail.com',
}

describe('getAuth — memoização por identidade de env', () => {
  test('o mesmo objeto env devolve a MESMA instância', () => {
    expect(getAuth(testEnv)).toBe(getAuth(testEnv))
  })

  test('um objeto env diferente devolve uma instância diferente', () => {
    const outroEnv: AuthBindings = { ...testEnv }
    expect(getAuth(testEnv)).not.toBe(getAuth(outroEnv))
  })
})

// Mesmo guard MEDIDO no finanças: sem ele, um BETTER_AUTH_SECRET vazio NÃO
// lança — o Better Auth cai pro default hardcoded do próprio pacote e só
// lançaria em produção de verdade (isProduction, que nunca é true num
// Worker). Ver o comentário MEDIDO em createAuth.
describe('createAuth — guard explícito de BETTER_AUTH_SECRET', () => {
  test('secret vazio lança (a lib, sozinha, não lançaria aqui)', () => {
    expect(() => createAuth({ ...testEnv, BETTER_AUTH_SECRET: '' })).toThrow(
      /BETTER_AUTH_SECRET ausente/,
    )
  })

  test('secret ausente em runtime (binding não setada) também lança', () => {
    expect(() =>
      createAuth({
        ...testEnv,
        BETTER_AUTH_SECRET: undefined as unknown as string,
      }),
    ).toThrow(/BETTER_AUTH_SECRET ausente/)
  })

  test('secret presente não lança', () => {
    expect(() => createAuth(testEnv)).not.toThrow()
  })
})

// --------------------------------------------------------------------
// Prova de que a votação é LIVRE via fluxo OAuth real (auth.handler), não
// via chamada interna adivinhada: signInSocial gera o cookie de
// state/PKCE, globalThis.fetch é sobrescrito só para o token endpoint do
// Google, e o id_token mockado só precisa ter FORMA de JWT — getUserInfo
// do provider Google decodifica via jose.decodeJwt sem checar assinatura
// (mesmo mecanismo medido no finanças, spike S5). Mesmo helper do
// finanças, portado 1:1.
// --------------------------------------------------------------------
function b64url(obj: Record<string, unknown>): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fakeIdToken(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.assinatura-nao-verificada`
}

function extrairCookiesParaHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

async function tentarLoginGoogle(
  auth: ReturnType<typeof createAuth>,
  baseURL: string,
  perfil: { sub: string; email: string; name: string },
  ip: string,
): Promise<Response> {
  const iniciar = await auth.api.signInSocial({
    body: { provider: 'google', callbackURL: '/', errorCallbackURL: '/login' },
    asResponse: true,
  })
  const { url } = (await iniciar.json()) as { url: string; redirect: boolean }
  const state = new URL(url).searchParams.get('state')
  const cookiesDeState = extrairCookiesParaHeader(iniciar.headers)

  const idToken = fakeIdToken({
    sub: perfil.sub,
    email: perfil.email,
    email_verified: true,
    name: perfil.name,
  })

  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlTexto =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (urlTexto.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'fake-access-token',
          id_token: idToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return fetchOriginal(input as Parameters<typeof fetch>[0])
  }) as typeof fetch

  try {
    const callbackUrl = `${baseURL}/api/auth/callback/google?code=codigo-fake&state=${encodeURIComponent(state ?? '')}`
    return await auth.handler(
      new Request(callbackUrl, {
        headers: {
          cookie: cookiesDeState,
          // Miniflare não simula a borda da Cloudflare — sem este header o
          // Better Auth não resolve IP nenhum e cai no shared bucket. IP
          // VARIA por teste (parâmetro `ip`, nunca uma constante do
          // arquivo): o Map de `storage: 'memory'` é singleton de MÓDULO
          // (mesma armadilha medida no finanças) — reset() do
          // cloudflare:test não o zera, e createAuth() novo não ganha
          // balde novo. Reusar IP entre testes deste describe acumularia
          // contagem contra o teto embutido de 3-por-10s de /sign-in*.
          'cf-connecting-ip': ip,
        },
      }),
    )
  } finally {
    globalThis.fetch = fetchOriginal
  }
}

describe('votação livre — QUALQUER conta Google completa o cadastro (o oposto do finanças)', () => {
  // O TESTE QUE DECIDE ESTA TASK: um e-mail que NÃO é admin (não está em
  // ADMIN_EMAILS) completa o cadastro e GRAVA linha em `user` — nunca é
  // bloqueado. Conta as linhas no D1 antes/depois, não confia só no status
  // HTTP (um 302 sem `?error=` já seria evidência, mas a contagem é a prova
  // que sobrevive a uma mutação futura no redirect).
  test('e-mail que NÃO está em ADMIN_EMAILS completa o login e cria 1 user + 1 account', async () => {
    const auth = createAuth(testEnv)

    const antes = await env.DB.prepare('SELECT count(*) AS n FROM user').first<{
      n: number
    }>()
    expect(antes?.n).toBe(0)

    const res = await tentarLoginGoogle(
      auth,
      testEnv.BETTER_AUTH_URL,
      { sub: 'sub-votante-comum', email: 'votante@gmail.com', name: 'Votante' },
      '203.0.113.10',
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).not.toContain('error=')

    const depoisUser = await env.DB.prepare(
      'SELECT count(*) AS n FROM user',
    ).first<{ n: number }>()
    const depoisAccount = await env.DB.prepare(
      'SELECT count(*) AS n FROM account',
    ).first<{ n: number }>()
    expect(depoisUser?.n).toBe(1)
    expect(depoisAccount?.n).toBe(1)

    const linha = await env.DB.prepare('SELECT email FROM user WHERE email = ?')
      .bind('votante@gmail.com')
      .first<{ email: string }>()
    expect(linha?.email).toBe('votante@gmail.com')
  })

  // Controle: um e-mail que ESTÁ em ADMIN_EMAILS também entra normalmente
  // pelo mesmo caminho — createAuth não trata os dois casos diferente
  // (isAdminEmail não é chamada aqui dentro; ver describe seguinte).
  test('e-mail que ESTÁ em ADMIN_EMAILS entra pelo mesmo caminho, sem tratamento especial', async () => {
    const auth = createAuth(testEnv)

    const res = await tentarLoginGoogle(
      auth,
      testEnv.BETTER_AUTH_URL,
      { sub: 'sub-admin', email: testEnv.ADMIN_EMAILS, name: 'Admin' },
      '203.0.113.11',
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).not.toContain('error=')

    const linha = await env.DB.prepare('SELECT email FROM user WHERE email = ?')
      .bind(testEnv.ADMIN_EMAILS)
      .first<{ email: string }>()
    expect(linha?.email).toBe(testEnv.ADMIN_EMAILS)
  })
})

// A prova negativa complementar ao describe acima: createAuth em si não
// consulta ADMIN_EMAILS nem chama isAdminEmail — é puramente uma função de
// leitura, sem side effect nenhum sobre o cadastro. Chamar createAuth com
// ADMIN_EMAILS completamente vazia não muda o resultado do login.
describe('isAdminEmail não é usada dentro de createAuth — admin é decisão da Task 4, não do cadastro', () => {
  test('ADMIN_EMAILS vazia não impede login nenhum (a allowlist de admin não é allowlist de acesso)', async () => {
    const envSemAdmins: AuthBindings = { ...testEnv, ADMIN_EMAILS: '' }
    const auth = createAuth(envSemAdmins)

    const res = await tentarLoginGoogle(
      auth,
      envSemAdmins.BETTER_AUTH_URL,
      {
        sub: 'sub-sem-admin-configurado',
        email: 'qualquer@gmail.com',
        name: 'Qualquer',
      },
      '203.0.113.12',
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).not.toContain('error=')

    const linha = await env.DB.prepare('SELECT email FROM user WHERE email = ?')
      .bind('qualquer@gmail.com')
      .first<{ email: string }>()
    expect(linha?.email).toBe('qualquer@gmail.com')
  })
})

// M1 (fix final do finanças, herdado aqui): sem customRules['/get-session'],
// o balde geral (window: 60, max: 20) governa get-session igual a qualquer
// outra rota fora de /sign-in* — um front chamando get-session no
// mount+foco de aba esgota os 20 rápido. IP dedicado (nunca usado por outro
// teste deste arquivo) porque o Map de 'memory' é singleton de MÓDULO.
describe('rateLimit.customRules — /get-session não herda o teto de 20/60s', () => {
  test('25 chamadas seguidas de /get-session (> 20, o max geral) não recebem 429', async () => {
    const auth = createAuth(testEnv)
    const ip = '203.0.113.42'

    for (let i = 0; i < 25; i++) {
      const res = await auth.handler(
        new Request(`${testEnv.BETTER_AUTH_URL}/api/auth/get-session`, {
          headers: { 'cf-connecting-ip': ip },
        }),
      )
      expect(res.status, `chamada ${i + 1}/25`).not.toBe(429)
    }
  })
})

// A segunda diferença obrigatória em relação ao finanças: trustedOrigins
// explícito incluindo a origem do apps/web. Provado contra o handler real,
// não só lendo a config de volta — POST /sign-in/social com Origin do
// apps/web (produção) não é barrado por origem; a MESMA chamada com um
// Origin fora da lista é.
describe('trustedOrigins — inclui a origem do apps/web (produção e dev), sem o quê o login nunca completa', () => {
  test('Origin de https://piluvitu.com.br (apps/web) não é barrado por origem', async () => {
    const auth = createAuth(testEnv)
    const res = await auth.handler(
      new Request(`${testEnv.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://piluvitu.com.br',
          cookie: 'marcador=presente',
          'cf-connecting-ip': '203.0.113.20',
        },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      }),
    )
    expect(res.status).not.toBe(403)
  })

  test('Origin de http://localhost:3333 (apps/web em dev) não é barrado por origem', async () => {
    const auth = createAuth(testEnv)
    const res = await auth.handler(
      new Request(`${testEnv.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3333',
          cookie: 'marcador=presente',
          'cf-connecting-ip': '203.0.113.21',
        },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      }),
    )
    expect(res.status).not.toBe(403)
  })

  test('Origin fora da allowlist responde 403 (a linha de trustedOrigins de fato filtra, não aceita qualquer coisa)', async () => {
    const auth = createAuth(testEnv)
    const res = await auth.handler(
      new Request(`${testEnv.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://site-estranho.example.com',
          cookie: 'marcador=presente',
          'cf-connecting-ip': '203.0.113.22',
        },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      }),
    )
    expect(res.status).toBe(403)
  })
})
