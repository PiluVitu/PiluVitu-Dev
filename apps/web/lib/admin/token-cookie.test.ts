/** @jest-environment node */
import { sealToken, openToken, ADMIN_GH_COOKIE } from './token-cookie'

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
})
