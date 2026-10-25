/**
 * Autenticador WebAuthn falso para teste: gera um par ES256 (P-256) pelo
 * WebCrypto do próprio workerd, monta a attestation `none` de um cadastro e
 * assina a assertion de um login. É o que deixa o teste passar pelo
 * `verifyRegistrationResponse`/`verifyAuthenticationResponse` de verdade do
 * `@simplewebauthn/server` (dentro do plugin), sem mock nenhum da conferência.
 *
 * Formatos (WebAuthn L2, §6.1 authenticatorData e §6.5.4 attestation `none`):
 *   authData = sha256(rpID) | flags | signCount(4, BE) [| aaguid(16) | len(2) | credId | coseKey]
 *   assinatura = ECDSA-SHA256(authData | sha256(clientDataJSON)), em DER
 */

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_AT = 0x40

export function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64url(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function concat(...partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = partes.reduce((n, p) => n + p.length, 0)
  const saida = new Uint8Array(total)
  let pos = 0
  for (const p of partes) {
    saida.set(p, pos)
    pos += p.length
  }
  return saida
}

async function sha256(dados: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', dados))
}

// CBOR mínimo (RFC 8949): só os tipos que attestationObject e a chave COSE usam.
function cabecalho(maior: number, n: number): Uint8Array {
  if (n < 24) return Uint8Array.of((maior << 5) | n)
  if (n < 256) return Uint8Array.of((maior << 5) | 24, n)
  return Uint8Array.of((maior << 5) | 25, n >> 8, n & 0xff)
}

type Cbor = number | string | Uint8Array | Map<number | string, Cbor>

function cbor(valor: Cbor): Uint8Array {
  if (typeof valor === 'number') {
    return valor >= 0 ? cabecalho(0, valor) : cabecalho(1, -1 - valor)
  }
  if (typeof valor === 'string') {
    const bytes = new TextEncoder().encode(valor)
    return concat(cabecalho(3, bytes.length), bytes)
  }
  if (valor instanceof Uint8Array) {
    return concat(cabecalho(2, valor.length), valor)
  }
  const itens: Uint8Array[] = [cabecalho(5, valor.size)]
  for (const [k, v] of valor) itens.push(cbor(k), cbor(v))
  return concat(...itens)
}

function inteiroDer(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  let corpo = bytes.slice(i)
  if (corpo[0] & 0x80) corpo = concat(Uint8Array.of(0), corpo)
  return concat(Uint8Array.of(0x02, corpo.length), corpo)
}

// WebCrypto devolve r||s cru (64 bytes); o WebAuthn transporta ES256 em DER.
function assinaturaDer(crua: Uint8Array): Uint8Array {
  const r = inteiroDer(crua.slice(0, 32))
  const s = inteiroDer(crua.slice(32))
  return concat(Uint8Array.of(0x30, r.length + s.length), r, s)
}

export type Cerimonia = {
  challenge: string
  origin: string
  rpID: string
  /** Flag UV (biometria/PIN). Padrão: true. */
  verificouUsuario?: boolean
}

export type AutenticadorFalso = {
  credentialId: string
  registrar(c: Cerimonia): Promise<Record<string, unknown>>
  autenticar(c: Cerimonia): Promise<Record<string, unknown>>
}

export async function criarAutenticadorFalso(): Promise<AutenticadorFalso> {
  const par = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', par.publicKey)) as {
    x: string
    y: string
  }
  const credId = crypto.getRandomValues(new Uint8Array(16))
  const credentialId = base64url(credId)
  let contador = 0

  const chaveCose = cbor(
    new Map<number, Cbor>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, deBase64url(jwk.x)],
      [-3, deBase64url(jwk.y)],
    ]),
  )

  function clientData(tipo: string, c: Cerimonia): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(
      JSON.stringify({
        type: tipo,
        challenge: c.challenge,
        origin: c.origin,
        crossOrigin: false,
      }),
    )
  }

  function flags(c: Cerimonia, extra = 0): number {
    return FLAG_UP | (c.verificouUsuario === false ? 0 : FLAG_UV) | extra
  }

  function contadorBE(n: number): Uint8Array {
    return Uint8Array.of(
      n >>> 24,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    )
  }

  return {
    credentialId,

    async registrar(c) {
      const authData = concat(
        await sha256(new TextEncoder().encode(c.rpID)),
        Uint8Array.of(flags(c, FLAG_AT)),
        contadorBE(0),
        new Uint8Array(16), // aaguid zerado, como o Safari manda com attestation 'none'
        Uint8Array.of(credId.length >> 8, credId.length & 0xff),
        credId,
        chaveCose,
      )
      const attestationObject = cbor(
        new Map<string, Cbor>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      )
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientData('webauthn.create', c)),
          attestationObject: base64url(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      }
    },

    async autenticar(c) {
      contador += 1
      const authData = concat(
        await sha256(new TextEncoder().encode(c.rpID)),
        Uint8Array.of(flags(c)),
        contadorBE(contador),
      )
      const cd = clientData('webauthn.get', c)
      const assinada = concat(authData, await sha256(cd))
      const crua = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          par.privateKey,
          assinada,
        ),
      )
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(cd),
          authenticatorData: base64url(authData),
          signature: base64url(assinaturaDer(crua)),
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      }
    },
  }
}
