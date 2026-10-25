/**
 * Só para teste: login Google de ponta a ponta pelo `auth.handler` real.
 * signInSocial gera o cookie de state/PKCE, `globalThis.fetch` é sobrescrito
 * só para o token endpoint do Google, e o id_token mockado só precisa ter
 * FORMA de JWT (getUserInfo do provider Google decodifica via
 * jose.decodeJwt sem checar assinatura).
 */
import type { createAuth } from '../lib/auth'

function b64url(obj: Record<string, unknown>): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fakeIdToken(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.assinatura-nao-verificada`
}

export function extrairCookiesParaHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

export async function tentarLoginGoogle(
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
