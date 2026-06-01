import { sfc32, seedFromBytes } from './prng'

describe('sfc32', () => {
  it('is deterministic for the same seed', () => {
    const a = sfc32(1, 2, 3, 4)
    const b = sfc32(1, 2, 3, 4)
    const seqA = Array.from({ length: 5 }, () => a.nextUint32())
    const seqB = Array.from({ length: 5 }, () => b.nextUint32())
    expect(seqA).toEqual(seqB)
  })

  it('float() stays in [0,1)', () => {
    const r = sfc32(9, 8, 7, 6)
    for (let i = 0; i < 1000; i++) {
      const f = r.float()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
  })

  it('int(n) stays in [0,n) and is roughly uniform', () => {
    const r = sfc32(42, 42, 42, 42)
    const n = 5
    const counts = new Array(n).fill(0)
    const N = 50000
    for (let i = 0; i < N; i++) counts[r.int(n)]++
    counts.forEach((c) => {
      expect(c).toBeGreaterThan((N / n) * 0.8)
      expect(c).toBeLessThan((N / n) * 1.2)
    })
  })

  it('int throws for non-positive bounds', () => {
    expect(() => sfc32(1, 1, 1, 1).int(0)).toThrow()
  })

  it('seedFromBytes is deterministic for the same bytes', () => {
    const bytes = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ])
    const a = seedFromBytes(bytes)
    const b = seedFromBytes(bytes)
    expect(a.nextUint32()).toBe(b.nextUint32())
  })
})
