/**
 * Validação do JWT do Cloudflare Access.
 *
 * O Access fica na frente do Worker (Custom Domain na zona piluvitu.com.br) e
 * injeta o header 'Cf-Access-Jwt-Assertion' em toda requisição que passou pela
 * policy. O Worker NÃO confia no header pela existência dele: valida assinatura
 * (RS256), aud, iss e exp contra o JWKS do time.
 *
 * CACHE DE JWKS NÃO É OPCIONAL: o fetch de
 * https://<teamDomain>/cdn-cgi/access/certs consome 1 dos 50 subrequests da
 * invocação e custa 50-150 ms. Sem cache, TODA chamada da SPA paga isso. Com
 * cache no escopo do módulo (vive enquanto o isolate viver) + TTL, o custo por
 * requisição vira ~1 ms de RS256.
 *
 * O preço do cache é a rotação de chave: se o kid do token não estiver no cache
 * quente, refazemos o fetch UMA vez antes de rejeitar — senão uma rotação
 * derrubaria o acesso por até um TTL inteiro.
 */
import type { MiddlewareHandler } from 'hono'
import { errJson } from './envelope'

export type AccessIdentity = { email: string; sub: string }

export class AccessError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AccessError'
  }
}

const JWKS_TTL_MS = 60 * 60 * 1000

type JwksCacheado = { keys: JsonWebKey[]; fetchedAt: number }

const jwksCache = new Map<string, JwksCacheado>()

async function buscarJwks(teamDomain: string): Promise<JsonWebKey[]> {
  let res: Response
  try {
    res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  } catch (err) {
    throw new AccessError(
      'jwks_unavailable',
      `falha ao buscar o JWKS do Access: ${String(err)}`,
    )
  }
  if (!res.ok) {
    throw new AccessError(
      'jwks_unavailable',
      `JWKS do Access respondeu ${res.status}`,
    )
  }
  const body = (await res.json()) as { keys?: JsonWebKey[] }
  if (!body.keys || body.keys.length === 0) {
    throw new AccessError('jwks_unavailable', 'JWKS do Access veio sem chaves')
  }
  jwksCache.set(teamDomain, { keys: body.keys, fetchedAt: Date.now() })
  return body.keys
}

async function chavePorKid(
  teamDomain: string,
  kid: string,
): Promise<JsonWebKey> {
  const cache = jwksCache.get(teamDomain)
  const quente =
    cache !== undefined && Date.now() - cache.fetchedAt < JWKS_TTL_MS

  let keys = quente ? cache.keys : await buscarJwks(teamDomain)
  let chave = keys.find((k) => (k as { kid?: string }).kid === kid)

  if (chave === undefined && quente) {
    // Rotação de chave: o cache está velho de conteúdo, não de tempo.
    keys = await buscarJwks(teamDomain)
    chave = keys.find((k) => (k as { kid?: string }).kid === kid)
  }
  if (chave === undefined) {
    throw new AccessError(
      'invalid_token',
      `kid ${kid} não está no JWKS do Access`,
    )
  }
  return chave
}

function bytesDeB64url(parte: string): Uint8Array<ArrayBuffer> {
  const b64 = parte.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function jsonDeB64url<T>(parte: string): T {
  return JSON.parse(new TextDecoder().decode(bytesDeB64url(parte))) as T
}

type JwtHeader = { alg?: string; kid?: string }
type JwtPayload = {
  aud?: string | string[]
  iss?: string
  exp?: number
  email?: string
  sub?: string
}

export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<AccessIdentity> {
  const partes = token.split('.')
  if (partes.length !== 3) {
    throw new AccessError('invalid_token', 'JWT do Access malformado')
  }

  let header: JwtHeader
  let payload: JwtPayload
  try {
    header = jsonDeB64url<JwtHeader>(partes[0])
    payload = jsonDeB64url<JwtPayload>(partes[1])
  } catch {
    throw new AccessError(
      'invalid_token',
      'JWT do Access não é base64url/JSON válido',
    )
  }

  if (header.alg !== 'RS256') {
    throw new AccessError(
      'invalid_token',
      `alg não suportado: ${String(header.alg)}`,
    )
  }
  if (!header.kid) {
    throw new AccessError('invalid_token', 'JWT do Access sem kid')
  }

  const jwk = await chavePorKid(teamDomain, header.kid)
  const chave = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const assinaturaOk = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    chave,
    bytesDeB64url(partes[2]),
    new TextEncoder().encode(`${partes[0]}.${partes[1]}`),
  )
  if (!assinaturaOk) {
    throw new AccessError(
      'invalid_token',
      'assinatura do JWT do Access não confere',
    )
  }

  const auds = Array.isArray(payload.aud)
    ? payload.aud
    : payload.aud
      ? [payload.aud]
      : []
  if (!auds.includes(aud)) {
    throw new AccessError(
      'invalid_audience',
      'aud do JWT não é a deste aplicativo',
    )
  }
  if (payload.iss !== `https://${teamDomain}`) {
    throw new AccessError('invalid_token', 'iss do JWT não é o time esperado')
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
    throw new AccessError('token_expired', 'JWT do Access expirado')
  }
  if (!payload.email || !payload.sub) {
    throw new AccessError('invalid_token', 'JWT do Access sem email ou sub')
  }

  return { email: payload.email, sub: payload.sub }
}

/**
 * Middleware do Hono que exige um JWT válido do Access e um e-mail da
 * allowlist. Módulo single-user: nada downstream lê a identidade, então ela
 * NÃO é gravada no contexto — o que mantém o tipo do Hono limpo nas Tasks 6-10.
 */
export function requireAccess(opts: {
  teamDomain: string
  aud: string
  allowedEmails: string[]
}): MiddlewareHandler {
  const permitidos = opts.allowedEmails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)

  return async (c, next) => {
    const token = c.req.header('Cf-Access-Jwt-Assertion')
    if (!token) {
      return errJson(
        401,
        'not_authenticated',
        'requisição sem o JWT do Cloudflare Access',
      )
    }

    let identidade: AccessIdentity
    try {
      identidade = await verifyAccessJwt(token, opts.teamDomain, opts.aud)
    } catch (err) {
      if (err instanceof AccessError) {
        const status = err.code === 'jwks_unavailable' ? 503 : 401
        return errJson(status, err.code, err.message)
      }
      throw err
    }

    if (!permitidos.includes(identidade.email.toLowerCase())) {
      return errJson(
        403,
        'email_not_allowed',
        `e-mail ${identidade.email} não tem acesso`,
      )
    }

    await next()
  }
}
