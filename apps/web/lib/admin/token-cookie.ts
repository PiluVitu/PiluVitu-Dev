import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto'

export const ADMIN_GH_COOKIE = 'piluvitu_admin_gh'

export interface AdminGithubToken {
  token: string
  login: string
  refreshToken?: string
  /** epoch ms when `token` expires (GitHub App expiring tokens); absent if non-expiring. */
  expiresAt?: number
}

const ALGO = 'aes-256-gcm'

function key(): Buffer {
  const secret = process.env.ADMIN_TOKEN_SECRET
  if (!secret) throw new Error('ADMIN_TOKEN_SECRET is not set')
  if (secret.length < 32) {
    throw new Error('ADMIN_TOKEN_SECRET must be at least 32 characters')
  }
  // Derive a fixed 32-byte key from the secret of any length.
  return createHash('sha256').update(secret).digest()
}

/** Encrypts the payload into a URL-safe cookie value: base64url(iv ‖ tag ‖ ciphertext). */
export function sealToken(payload: AdminGithubToken): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key(), iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url')
}

/** Decrypts a sealed cookie. Returns null on any tamper/parse/auth failure. */
export function openToken(sealed: string): AdminGithubToken | null {
  try {
    const raw = Buffer.from(sealed, 'base64url')
    if (raw.length < 28) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const decipher = createDecipheriv(ALGO, key(), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    const parsed = JSON.parse(
      plaintext.toString('utf8'),
    ) as Partial<AdminGithubToken>
    if (typeof parsed.token !== 'string' || typeof parsed.login !== 'string') {
      return null
    }
    return parsed as AdminGithubToken
  } catch {
    return null
  }
}
