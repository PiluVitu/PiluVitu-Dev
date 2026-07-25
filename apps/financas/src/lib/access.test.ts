import { Hono } from 'hono'
import { beforeAll, describe, expect, test } from 'vitest'
import { AccessError, requireAccess, verifyAccessJwt } from './access'

/**
 * DESVIO MEDIDO DO BRIEF: a versão instalada (e mais recente publicada)
 * de @cloudflare/vitest-pool-workers, 0.18.8, NÃO exporta `fetchMock` de
 * 'cloudflare:test' — conferido em todo o pacote (types/ e dist/), inclusive
 * na lista explícita de re-exports de dist/worker/lib/cloudflare/test-internal.mjs,
 * onde 'fetchMock' simplesmente não aparece. `import { fetchMock } from
 * 'cloudflare:test'` importa `undefined` sem erro (o módulo não é ESM estrito
 * o bastante para recusar o binding em tempo de link), e só explode no uso.
 *
 * Substituto usado aqui, MEDIDO como funcional neste ambiente: sobrescrever
 * `globalThis.fetch` diretamente. `access.ts` chama o `fetch` global sem
 * import — como o teste roda no MESMO isolate/worker (import direto de
 * './access', não via SELF/service binding), a sobrescrita é visível pro
 * módulo sob teste. Isso NÃO enfraquece o teste: a verificação de assinatura
 * RS256 continua rodando de verdade via WebCrypto — só a resposta HTTP do
 * JWKS é substituída, exatamente como o `fetchMock` faria.
 *
 * `servirJwksMock` replica a semântica de um interceptor do undici: cada
 * chamada enfileira UMA resposta, consumida na próxima requisição casada por
 * domínio — é o que sustenta o teste de cache (uma 2ª chamada de rede sem
 * interceptor sobrando falha) e o de rotação de chave (duas respostas em
 * sequência para o mesmo domínio).
 */
type RespostaMock = { status: number; body: unknown }

const filaJwksPorDominio = new Map<string, RespostaMock[]>()

function enfileirarRespostaJwks(
  teamDomain: string,
  status: number,
  body: unknown,
): void {
  const fila = filaJwksPorDominio.get(teamDomain) ?? []
  fila.push({ status, body })
  filaJwksPorDominio.set(teamDomain, fila)
}

async function mockFetchDispatcher(
  input: RequestInfo | URL,
): Promise<Response> {
  const urlTexto =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  const url = new URL(urlTexto)
  if (url.pathname !== '/cdn-cgi/access/certs') {
    throw new Error(`fetch não mockado para ${urlTexto}`)
  }

  const fila = filaJwksPorDominio.get(url.host)
  const proxima = fila?.shift()
  if (!proxima) {
    throw new Error(`nenhuma resposta de JWKS mockada para ${url.host}`)
  }

  const corpo =
    typeof proxima.body === 'string'
      ? proxima.body
      : JSON.stringify(proxima.body)
  return new Response(corpo, { status: proxima.status })
}

type Par = { priv: CryptoKey; jwk: JsonWebKey }

let parA: Par
let parB: Par

async function gerarPar(kid: string): Promise<Par> {
  const { privateKey, publicKey } = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const exportada = (await crypto.subtle.exportKey('jwk', publicKey)) as {
    n: string
    e: string
  }
  // Mesmos campos que o JWKS do Cloudflare Access devolve.
  return {
    priv: privateKey,
    jwk: {
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      kid,
      n: exportada.n,
      e: exportada.e,
    },
  }
}

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlText(texto: string): string {
  return b64url(new TextEncoder().encode(texto))
}

async function assinar(
  par: Par,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const cabeca = b64urlText(JSON.stringify(header))
  const corpo = b64urlText(JSON.stringify(payload))
  const assinatura = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    par.priv,
    new TextEncoder().encode(`${cabeca}.${corpo}`),
  )
  return `${cabeca}.${corpo}.${b64url(new Uint8Array(assinatura))}`
}

const AUD = 'aud-de-teste-1234'

function payloadValido(
  teamDomain: string,
  extra: Record<string, unknown> = {},
) {
  return {
    aud: [AUD],
    iss: `https://${teamDomain}`,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: 'dono@exemplo.com',
    sub: 'sub-do-dono',
    ...extra,
  }
}

/** Registra UM atendimento do JWKS para o domínio (consumido na 1ª chamada). */
function servirJwks(teamDomain: string, chaves: JsonWebKey[]): void {
  enfileirarRespostaJwks(teamDomain, 200, { keys: chaves })
}

beforeAll(async () => {
  globalThis.fetch = mockFetchDispatcher as typeof fetch
  parA = await gerarPar('kid-a')
  parB = await gerarPar('kid-b')
})

describe('verifyAccessJwt', () => {
  test('caminho feliz: devolve email e sub do token', async () => {
    const dom = 'feliz.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).resolves.toEqual({
      email: 'dono@exemplo.com',
      sub: 'sub-do-dono',
    })
  })

  test('cacheia o JWKS: duas validações, um único fetch', async () => {
    const dom = 'cache.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk]) // um único atendimento registrado
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).resolves.toMatchObject({
      email: 'dono@exemplo.com',
    })
    // Se a 2ª validação fosse à rede, não haveria resposta mockada sobrando e
    // o dispatcher rejeitaria com "nenhuma resposta de JWKS mockada".
    await expect(verifyAccessJwt(token, dom, AUD)).resolves.toMatchObject({
      email: 'dono@exemplo.com',
    })
  })

  test('kid desconhecido com cache quente força um refetch do JWKS', async () => {
    const dom = 'rotacao.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const tokenA = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    await expect(verifyAccessJwt(tokenA, dom, AUD)).resolves.toMatchObject({
      sub: 'sub-do-dono',
    })

    // A Cloudflare rotacionou a chave: o JWKS agora tem kid-b.
    servirJwks(dom, [parB.jwk])
    const tokenB = await assinar(
      parB,
      { alg: 'RS256', kid: 'kid-b' },
      payloadValido(dom),
    )
    await expect(verifyAccessJwt(tokenB, dom, AUD)).resolves.toMatchObject({
      sub: 'sub-do-dono',
    })
  })

  test('token malformado (sem três partes) é invalid_token', async () => {
    const dom = 'malformado.cloudflareaccess.com'
    await expect(
      verifyAccessJwt('nao-e-um-jwt', dom, AUD),
    ).rejects.toMatchObject({
      name: 'AccessError',
      code: 'invalid_token',
    })
  })

  test('alg diferente de RS256 é invalid_token', async () => {
    const dom = 'alg.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'none', kid: 'kid-a' },
      payloadValido(dom),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_token',
    })
  })

  test('assinatura inválida (payload adulterado) é invalid_token', async () => {
    const dom = 'assinatura.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    const [cabeca, , assinatura] = token.split('.')
    const adulterado = `${cabeca}.${b64urlText(
      JSON.stringify(payloadValido(dom, { email: 'invasor@exemplo.com' })),
    )}.${assinatura}`

    await expect(verifyAccessJwt(adulterado, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_token',
    })
  })

  test('aud errado é invalid_audience', async () => {
    const dom = 'aud.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom, { aud: ['aud-de-outro-app'] }),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_audience',
    })
  })

  test('iss de outro time é invalid_token', async () => {
    const dom = 'iss.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom, { iss: 'https://outro-time.cloudflareaccess.com' }),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_token',
    })
  })

  test('token expirado é token_expired', async () => {
    const dom = 'expirado.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom, { exp: Math.floor(Date.now() / 1000) - 60 }),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'token_expired',
    })
  })

  test('token sem email é invalid_token', async () => {
    const dom = 'sememail.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const semEmail = payloadValido(dom) as Record<string, unknown>
    delete semEmail.email
    const token = await assinar(parA, { alg: 'RS256', kid: 'kid-a' }, semEmail)

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_token',
    })
  })

  test('JWKS fora do ar é jwks_unavailable', async () => {
    const dom = 'jwksfora.cloudflareaccess.com'
    enfileirarRespostaJwks(dom, 500, 'boom')
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'jwks_unavailable',
    })
  })

  test('AccessError é instância de Error e carrega o code', () => {
    const err = new AccessError('invalid_token', 'JWT malformado')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AccessError')
    expect(err.code).toBe('invalid_token')
    expect(err.message).toBe('JWT malformado')
  })
})

function appProtegido(opts: {
  teamDomain: string
  aud: string
  allowedEmails: string[]
}) {
  const app = new Hono()
  app.use('/protegido', requireAccess(opts))
  app.get('/protegido', (c) => c.json({ visto: true }))
  return app
}

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string; type: string }>
}

describe('requireAccess', () => {
  test('sem o header do Access responde 401 not_authenticated', async () => {
    const app = appProtegido({
      teamDomain: 'mw-sem-header.cloudflareaccess.com',
      aud: AUD,
      allowedEmails: ['dono@exemplo.com'],
    })

    const res = await app.request('/protegido')
    expect(res.status).toBe(401)

    const body = (await res.json()) as CorpoErro
    expect(body.ok).toBe(false)
    expect(body.data).toBeNull()
    expect(body.notifications[0]).toMatchObject({
      type: 'error',
      code: 'not_authenticated',
    })
  })

  test('token inválido responde 401 invalid_token', async () => {
    const app = appProtegido({
      teamDomain: 'mw-invalido.cloudflareaccess.com',
      aud: AUD,
      allowedEmails: ['dono@exemplo.com'],
    })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': 'nao-e-um-jwt' },
    })
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'invalid_token',
    )
  })

  test('e-mail fora da allowlist responde 403 email_not_allowed', async () => {
    const dom = 'mw-allowlist.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom, { email: 'estranho@exemplo.com' }),
    )
    const app = appProtegido({
      teamDomain: dom,
      aud: AUD,
      allowedEmails: ['dono@exemplo.com'],
    })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(403)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'email_not_allowed',
    )
  })

  test('allowlist vazia barra todo mundo (fail closed)', async () => {
    const dom = 'mw-vazia.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    const app = appProtegido({ teamDomain: dom, aud: AUD, allowedEmails: [] })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(403)
  })

  test('caminho feliz deixa o handler rodar', async () => {
    const dom = 'mw-feliz.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    const app = appProtegido({
      teamDomain: dom,
      aud: AUD,
      allowedEmails: ['dono@exemplo.com'],
    })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ visto: true })
  })

  test('allowlist compara e-mail sem diferenciar maiúsculas', async () => {
    const dom = 'mw-caixa.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    const app = appProtegido({
      teamDomain: dom,
      aud: AUD,
      allowedEmails: [' Dono@Exemplo.COM '],
    })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(200)
  })
})
