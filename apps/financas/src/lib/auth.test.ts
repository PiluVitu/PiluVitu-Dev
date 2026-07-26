import { env } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import {
  CODIGO_BARRADO,
  assertEmailPermitido,
  createAuth,
  getAuth,
  isAllowedEmail,
  type AuthBindings,
} from './auth'

const PERMITIDO = 'dono@exemplo.com'

describe('isAllowedEmail — pura, fail closed', () => {
  test.each([
    ['dono@exemplo.com', PERMITIDO, true],
    [' Dono@Exemplo.COM ', PERMITIDO, true],
    ['dono@exemplo.com.br', PERMITIDO, false],
    ['xdono@exemplo.com', PERMITIDO, false],
    ['', PERMITIDO, false],
    [null, PERMITIDO, false],
    [undefined, PERMITIDO, false],
    [42, PERMITIDO, false],
    [PERMITIDO, '', false], // ALLOWED_EMAIL vazio barra até o e-mail certo
    // `permitido` é tipado `string`, mas uma binding não setada é `undefined`
    // EM RUNTIME (o tipo é uma promessa de compile-time, não uma garantia
    // do Worker) — é o `?? ''` dentro de isAllowedEmail que cobre isto; sem
    // ele, `undefined.trim()` estouraria em vez de barrar educadamente.
    [PERMITIDO, undefined as unknown as string, false],
    [PERMITIDO, `${PERMITIDO},outro@exemplo.com`, false], // CSV não é suportado (ACCESS_ALLOWED_EMAILS era; ALLOWED_EMAIL NÃO é) — fail-closed, mas barra até o dono
  ])('isAllowedEmail(%o, %o) === %s', (email, permitido, esperado) => {
    expect(isAllowedEmail(email, permitido)).toBe(esperado)
  })
})

describe('assertEmailPermitido', () => {
  test('e-mail estranho lança APIError FORBIDDEN com o slug', () => {
    expect(() =>
      assertEmailPermitido('invasor@gmail.com', PERMITIDO),
    ).toThrowError(
      expect.objectContaining({ status: 'FORBIDDEN', message: CODIGO_BARRADO }),
    )
  })

  test('o slug é minúsculo, sem acento, sem espaço (vira query string crua)', () => {
    expect(CODIGO_BARRADO).toMatch(/^[a-z0-9_]+$/)
  })

  test('e-mail permitido não lança', () => {
    expect(() => assertEmailPermitido(PERMITIDO, PERMITIDO)).not.toThrow()
  })
})

const testEnv: AuthBindings = {
  DB: env.DB,
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id-de-teste',
  GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
  ALLOWED_EMAIL: PERMITIDO,
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

// Fix round 1: sem este guard explícito, um BETTER_AUTH_SECRET vazio NÃO
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
// Prova de bloqueio via fluxo OAuth real (auth.handler), não via chamada
// interna adivinhada: signInSocial gera o cookie de state/PKCE,
// globalThis.fetch é sobrescrito só para o token endpoint do Google, e o
// id_token mockado só precisa ter FORMA de JWT — getUserInfo do provider
// Google decodifica via jose.decodeJwt sem checar assinatura (medido no
// spike S5). Isso exercita o hook databaseHooks.user.create.before de
// dentro do caminho real, sem depender de nenhuma API interna não
// documentada.
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
          // Better Auth não resolve IP nenhum e cai no shared bucket
          // (WARN "falling back to a single shared per-path bucket"), o que
          // mascararia um `advanced.ipAddress.ipAddressHeaders` errado em
          // createAuth. 203.0.113.0/24 é TEST-NET-3 (RFC 5737), reservado
          // pra documentação/teste — nunca roteável de verdade.
          'cf-connecting-ip': '203.0.113.7',
        },
      }),
    )
  } finally {
    globalThis.fetch = fetchOriginal
  }
}

describe('databaseHooks.user.create.before — bloqueio real de ponta a ponta', () => {
  test('e-mail fora da allowlist: 302 com ?error=nao_autorizado e ZERO linhas em user/account', async () => {
    const auth = createAuth(testEnv)

    const res = await tentarLoginGoogle(auth, testEnv.BETTER_AUTH_URL, {
      sub: 'sub-invasor',
      email: 'invasor@gmail.com',
      name: 'Invasor',
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain(`error=${CODIGO_BARRADO}`)

    const u = await env.DB.prepare('SELECT count(*) AS n FROM user').first<{
      n: number
    }>()
    const a = await env.DB.prepare('SELECT count(*) AS n FROM account').first<{
      n: number
    }>()
    expect(u?.n).toBe(0)
    expect(a?.n).toBe(0)
  })

  test('e-mail permitido: cria exatamente 1 user e 1 account (controle positivo)', async () => {
    const auth = createAuth(testEnv)

    const res = await tentarLoginGoogle(auth, testEnv.BETTER_AUTH_URL, {
      sub: 'sub-dono',
      email: PERMITIDO,
      name: 'Dono',
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).not.toContain('error=')

    const u = await env.DB.prepare('SELECT count(*) AS n FROM user').first<{
      n: number
    }>()
    const a = await env.DB.prepare('SELECT count(*) AS n FROM account').first<{
      n: number
    }>()
    expect(u?.n).toBe(1)
    expect(a?.n).toBe(1)
  })

  // Todo teste acima usa testEnv.ALLOWED_EMAIL === PERMITIDO — a MESMA
  // constante que a asserção compara. Isso prova que o hook barra/libera
  // CORRETAMENTE para aquele valor, mas não prova que ele está LENDO
  // env.ALLOWED_EMAIL — um hook hardcoded com a string 'dono@exemplo.com'
  // (nunca tocando `env`) passaria em todos eles igualzinho. Este teste
  // muda o valor da allowlist para outro e-mail e reafirma o MESMO
  // PERMITIDO de antes: só passa se createAuth de fato ler
  // env.ALLOWED_EMAIL — não uma constante interna.
  test('a allowlist realmente vem de env.ALLOWED_EMAIL, não de uma constante interna: trocando o env, o mesmo PERMITIDO passa a ser barrado', async () => {
    const envComOutraAllowlist: AuthBindings = {
      ...testEnv,
      ALLOWED_EMAIL: 'outro@exemplo.com',
    }
    const auth = createAuth(envComOutraAllowlist)

    const res = await tentarLoginGoogle(
      auth,
      envComOutraAllowlist.BETTER_AUTH_URL,
      {
        sub: 'sub-dono',
        email: PERMITIDO,
        name: 'Dono',
      },
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain(`error=${CODIGO_BARRADO}`)

    const u = await env.DB.prepare('SELECT count(*) AS n FROM user').first<{
      n: number
    }>()
    const a = await env.DB.prepare('SELECT count(*) AS n FROM account').first<{
      n: number
    }>()
    expect(u?.n).toBe(0)
    expect(a?.n).toBe(0)
  })
})

// M1 (fix final): sem customRules['/get-session'], o balde geral (window:
// 60, max: 20) governa get-session igual a qualquer outra rota fora de
// /sign-in* — um checklist de deploy cheio de reload/troca de aba raspa os
// 20 e o dono LOGADO cai na tela de login por um 429. IP dedicado
// (203.0.113.42, nunca usado por outro teste deste arquivo) porque o Map de
// 'memory' é singleton de MÓDULO (rate-limiter/index.mjs:6) — reset() do
// cloudflare:test não zera ele, e testes que reusam IP acumulariam
// contagem entre si (mesma armadilha documentada em CLAUDE.md pro bloco de
// /sign-in*).
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
