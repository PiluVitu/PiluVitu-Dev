import { toHex, fromHex, cryptoRandomBytes, mixEntropy } from './entropy'

describe('entropy', () => {
  it('toHex/fromHex round-trip', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255, 128])
    expect(fromHex(toHex(bytes))).toEqual(bytes)
  })

  it('toHex pads each byte to two chars', () => {
    expect(toHex(new Uint8Array([1, 255]))).toBe('01ff')
  })

  it('fromHex rejects odd-length input', () => {
    expect(() => fromHex('abc')).toThrow()
  })

  it('cryptoRandomBytes returns the requested length', () => {
    expect(cryptoRandomBytes(32).length).toBe(32)
  })

  it('mixEntropy produces a 32-byte SHA-256 digest', async () => {
    const out = await mixEntropy(new Uint8Array([1, 2, 3]))
    expect(out.length).toBe(32)
  })

  it('mixEntropy is non-deterministic across calls (CSPRNG mixed in)', async () => {
    const a = await mixEntropy(new Uint8Array([1, 2, 3]))
    const b = await mixEntropy(new Uint8Array([1, 2, 3]))
    expect(toHex(a)).not.toBe(toHex(b))
  })
})
