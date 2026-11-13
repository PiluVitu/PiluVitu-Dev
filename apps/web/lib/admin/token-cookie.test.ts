/** @jest-environment node */
import { createDecipheriv, createHash } from 'crypto'
import {
  sealToken,
  openToken,
  selar,
  abrir,
  ADMIN_GH_COOKIE,
} from './token-cookie'

const PAYLOAD = {
  token: 'gho_abc123',
  login: 'piluvitu',
  refreshToken: 'r1',
  expiresAt: 123,
}

beforeAll(() => {
  process.env.ADMIN_TOKEN_SECRET = 'test-secret-please-change-0123456789'
})

describe('token-cookie', () => {
  it('round-trips a payload', () => {
    const sealed = sealToken(PAYLOAD)
    expect(typeof sealed).toBe('string')
    expect(sealed).not.toContain('gho_abc123') // ciphertext, not plaintext
    expect(openToken(sealed)).toEqual(PAYLOAD)
  })

  it('returns null for a tampered cookie', () => {
    const sealed = sealToken(PAYLOAD)
    const tampered =
      sealed.slice(0, -2) +
      (sealed.endsWith('A') ? 'B' : 'A') +
      sealed.slice(-1)
    expect(openToken(tampered)).toBeNull()
  })

  it('returns null for garbage', () => {
    expect(openToken('not-base64url!!')).toBeNull()
    expect(openToken('')).toBeNull()
  })

  it('throws when the secret is missing', () => {
    const prev = process.env.ADMIN_TOKEN_SECRET
    delete process.env.ADMIN_TOKEN_SECRET
    expect(() => sealToken(PAYLOAD)).toThrow(/ADMIN_TOKEN_SECRET/)
    process.env.ADMIN_TOKEN_SECRET = prev
  })

  it('exposes the cookie name', () => {
    expect(ADMIN_GH_COOKIE).toBe('piluvitu_admin_gh')
  })

  it('throws when the secret is too short', () => {
    const prev = process.env.ADMIN_TOKEN_SECRET
    process.env.ADMIN_TOKEN_SECRET = 'too-short'
    expect(() => sealToken(PAYLOAD)).toThrow(/at least 32 characters/)
    process.env.ADMIN_TOKEN_SECRET = prev
  })

  it('returns null when opening with the secret missing', () => {
    const sealed = sealToken(PAYLOAD)
    const prev = process.env.ADMIN_TOKEN_SECRET
    delete process.env.ADMIN_TOKEN_SECRET
    expect(openToken(sealed)).toBeNull()
    process.env.ADMIN_TOKEN_SECRET = prev
  })

  it('returns null when the decrypted payload is missing required fields', () => {
    // Seal a structurally-invalid payload by casting, then confirm openToken rejects it.
    const sealed = sealToken({ login: 'x' } as unknown as Parameters<
      typeof sealToken
    >[0])
    expect(openToken(sealed)).toBeNull()
  })

  it('o formato do piluvitu_admin_gh não muda: base64url(iv ‖ tag ‖ cifra), sem AAD', () => {
    const sealed = sealToken(PAYLOAD)
    const raw = Buffer.from(sealed, 'base64url')
    const chave = createHash('sha256')
      .update(process.env.ADMIN_TOKEN_SECRET!)
      .digest()
    const decipher = createDecipheriv('aes-256-gcm', chave, raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const texto = Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString('utf8')
    expect(JSON.parse(texto)).toEqual(PAYLOAD)
  })
})

describe('selar / abrir', () => {
  it('ida e volta de qualquer JSON', () => {
    expect(abrir(selar({ a: 1, b: ['x'] }))).toEqual({ a: 1, b: ['x'] })
  })

  it('com contexto, só abre com o mesmo contexto', () => {
    const selado = selar({ a: 1 }, 'contexto-a')
    expect(abrir(selado, 'contexto-a')).toEqual({ a: 1 })
    expect(abrir(selado, 'contexto-b')).toBeNull()
    expect(abrir(selado)).toBeNull()
  })

  it('o selado sem contexto não abre com contexto', () => {
    expect(abrir(selar({ a: 1 }), 'contexto-a')).toBeNull()
  })

  it('lixo é null', () => {
    expect(abrir('')).toBeNull()
    expect(abrir('nao-base64url!!', 'x')).toBeNull()
  })
})
