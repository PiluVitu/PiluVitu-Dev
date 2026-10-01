/**
 * Deterministic, fast, decent-quality PRNG (sfc32). Pure and portable — no DOM,
 * no crypto. Seed it from entropy bytes via seedFromBytes(). Given the same
 * seed it always yields the same sequence (reproducible draws).
 */
export interface Prng {
  nextUint32(): number
  float(): number
  int(maxExclusive: number): number
  pick<T>(arr: T[]): { index: number; value: T }
  shuffle<T>(arr: T[]): T[]
}

export function sfc32(a: number, b: number, c: number, d: number): Prng {
  let s0 = a >>> 0
  let s1 = b >>> 0
  let s2 = c >>> 0
  let s3 = d >>> 0

  function nextUint32(): number {
    const t = (((s0 + s1) | 0) + s3) | 0
    s3 = (s3 + 1) | 0
    s0 = s1 ^ (s1 >>> 9)
    s1 = (s2 + (s2 << 3)) | 0
    s2 = ((s2 << 21) | (s2 >>> 11)) >>> 0
    s2 = (s2 + t) | 0
    return t >>> 0
  }

  for (let i = 0; i < 15; i++) nextUint32()

  function int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error('int: maxExclusive must be a positive integer')
    }
    // Rejection sampling for an unbiased result in [0, maxExclusive). Assumes
    // maxExclusive <= 2^32 (true for all real callers — option/movie counts);
    // for n > 2^32 `limit` would be 0 and this would loop.
    const limit = 0x100000000 - (0x100000000 % maxExclusive)
    let x = nextUint32()
    while (x >= limit) x = nextUint32()
    return x % maxExclusive
  }

  function float(): number {
    return nextUint32() / 0x100000000
  }

  function pick<T>(arr: T[]): { index: number; value: T } {
    const index = int(arr.length)
    return { index, value: arr[index] }
  }

  function shuffle<T>(arr: T[]): T[] {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  return { nextUint32, float, int, pick, shuffle }
}

/**
 * Builds a Prng from arbitrary entropy bytes by reading the first 16 bytes as
 * four big-endian uint32 seeds (deterministically padded when shorter).
 */
export function seedFromBytes(bytes: Uint8Array): Prng {
  const u = (i: number): number => {
    const o = i * 4
    if (o + 4 > bytes.length) return (0x9e3779b9 ^ (i + 1)) >>> 0
    return (
      ((bytes[o] << 24) |
        (bytes[o + 1] << 16) |
        (bytes[o + 2] << 8) |
        bytes[o + 3]) >>>
      0
    )
  }
  return sfc32(u(0), u(1), u(2), u(3))
}
