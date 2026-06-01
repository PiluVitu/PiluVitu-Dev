import { normalizeOptions, drawWinnerIndex } from './roleta'
import { toHex } from './entropy'

describe('roleta', () => {
  it('normalizeOptions trims, drops blanks, assigns ids', () => {
    const opts = normalizeOptions('  A \n\n B\nC  \n')
    expect(opts.map((o) => o.label)).toEqual(['A', 'B', 'C'])
    expect(opts.map((o) => o.id)).toEqual(['0', '1', '2'])
  })

  it('drawWinnerIndex is deterministic for a given digest', () => {
    const digest = toHex(new Uint8Array(32).fill(7))
    expect(drawWinnerIndex(4, digest)).toBe(drawWinnerIndex(4, digest))
  })

  it('drawWinnerIndex stays within range', () => {
    for (let seed = 0; seed < 50; seed++) {
      const digest = toHex(new Uint8Array(32).fill(seed))
      const idx = drawWinnerIndex(3, digest)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(3)
    }
  })

  it('drawWinnerIndex throws when there are no options', () => {
    expect(() => drawWinnerIndex(0, '00')).toThrow()
  })
})
