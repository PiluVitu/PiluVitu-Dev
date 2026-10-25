/**
 * Só para teste (nenhum módulo de produção importa este arquivo).
 *
 * Autenticador WebAuthn em software: chave ES256 (P-256) do WebCrypto,
 * attestation "none", CBOR mínimo escrito à mão. Produz as respostas JSON que
 * o `@simplewebauthn/browser` mandaria ao Worker, para exercitar o plugin de
 * passkey de ponta a ponta sem navegador.
 */

type Bytes = Uint8Array<ArrayBuffer>
type Cbor = number | string | Bytes | Map<Cbor, Cbor>

function cabecalho(maior: number, n: number): number[] {
  if (n < 24) return [(maior << 5) | n]
  if (n < 256) return [(maior << 5) | 24, n]
  if (n < 65536) return [(maior << 5) | 25, n >> 8, n & 0xff]
  throw new Error('CBOR falso: tamanho não suportado')
}

function cbor(v: Cbor): Bytes {
  if (typeof v === 'number') {
    return Uint8Array.from(v >= 0 ? cabecalho(0, v) : cabecalho(1, -1 - v))
  }
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v)
    return juntar(Uint8Array.from(cabecalho(3, b.length)), b)
  }
  if (v instanceof Uint8Array) {
    return juntar(Uint8Array.from(cabecalho(2, v.length)), v)
  }
  const partes: Bytes[] = [Uint8Array.from(cabecalho(5, v.size))]
  for (const [k, val] of v) partes.push(cbor(k), cbor(val))
  return juntar(...partes)
}

function juntar(...partes: Bytes[]): Bytes {
  const total = partes.reduce((n, p) => n + p.length, 0)
  const saida = new Uint8Array(total)
  let i = 0
  for (const p of partes) {
    saida.set(p, i)
    i += p.length
  }
  return saida
}

export function paraBase64Url(bytes: Bytes): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64Url(texto: string): Bytes {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function sha256(dados: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', dados))
}

function inteiroDer(bytes: Bytes): Bytes {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  let v = bytes.slice(i)
  if (v[0]! & 0x80) v = juntar(Uint8Array.of(0), v)
  return juntar(Uint8Array.of(0x02, v.length), v)
}

/** WebCrypto devolve r||s cru; WebAuthn (e o simplewebauthn) espera DER. */
function assinaturaDer(crua: Bytes): Bytes {
  const r = inteiroDer(crua.slice(0, 32))
  const s = inteiroDer(crua.slice(32))
  return juntar(Uint8Array.of(0x30, r.length + s.length), r, s)
}

const UP = 0x01
const UV = 0x04
const AT = 0x40

export type OpcoesCerimonia = {
  origin: string
  rpID: string
  /** Default true. false simula um autenticador que só confere presença. */
  uv?: boolean
}

export async function criarAutenticadorFalso() {
  const par = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey(
    'jwk',
    par.publicKey,
  )) as JsonWebKey
  const credId = crypto.getRandomValues(new Uint8Array(16))
  const id = paraBase64Url(credId)
  let contador = 0

  const coseKey = cbor(
    new Map<Cbor, Cbor>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, deBase64Url(jwk.x!)],
      [-3, deBase64Url(jwk.y!)],
    ]),
  )

  function clientData(tipo: string, challenge: string, origin: string) {
    return new TextEncoder().encode(
      JSON.stringify({ type: tipo, challenge, origin, crossOrigin: false }),
    )
  }

  function contadorBytes(n: number): Bytes {
    return Uint8Array.of(
      n >>> 24,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    )
  }

  return {
    id,

    async registrar(challenge: string, o: OpcoesCerimonia) {
      const flags = UP | AT | (o.uv === false ? 0 : UV)
      const authData = juntar(
        await sha256(new TextEncoder().encode(o.rpID)),
        Uint8Array.of(flags),
        contadorBytes(0),
        new Uint8Array(16),
        Uint8Array.of(credId.length >> 8, credId.length & 0xff),
        credId,
        coseKey,
      )
      const attestationObject = cbor(
        new Map<Cbor, Cbor>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      )
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: paraBase64Url(
            clientData('webauthn.create', challenge, o.origin),
          ),
          attestationObject: paraBase64Url(attestationObject),
          transports: ['internal'],
        },
      }
    },

    async autenticar(challenge: string, o: OpcoesCerimonia) {
      contador += 1
      const flags = UP | (o.uv === false ? 0 : UV)
      const authData = juntar(
        await sha256(new TextEncoder().encode(o.rpID)),
        Uint8Array.of(flags),
        contadorBytes(contador),
      )
      const cd = clientData('webauthn.get', challenge, o.origin)
      const assinada = juntar(authData, await sha256(cd))
      const crua = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          par.privateKey,
          assinada,
        ),
      )
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: paraBase64Url(cd),
          authenticatorData: paraBase64Url(authData),
          signature: paraBase64Url(assinaturaDer(crua)),
        },
      }
    },
  }
}
