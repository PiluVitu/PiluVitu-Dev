/**
 * Entropy mixing for randomness seeds. Pure/portable (Web Crypto API — browser,
 * Node 20+, jsdom via setup). mixEntropy ALWAYS folds in a fresh CSPRNG sample,
 * so the output is never weaker than crypto.getRandomValues even if a caller's
 * source (e.g. a black camera frame) carries little entropy.
 */
export function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('fromHex: hex length must be even')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error('fromHex: invalid hex')
    out[i] = byte
  }
  return out
}

export function cryptoRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  globalThis.crypto.getRandomValues(out)
  return out
}

export async function mixEntropy(
  ...sources: Uint8Array[]
): Promise<Uint8Array> {
  const all = [...sources, cryptoRandomBytes(32)]
  const total = all.reduce((n, s) => n + s.length, 0)
  const buf = new Uint8Array(total)
  let off = 0
  for (const s of all) {
    buf.set(s, off)
    off += s.length
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buf)
  return new Uint8Array(digest)
}

/** Convenience: mix sources and return the digest as a lowercase hex string. */
export async function mixEntropyHex(...sources: Uint8Array[]): Promise<string> {
  return toHex(await mixEntropy(...sources))
}
