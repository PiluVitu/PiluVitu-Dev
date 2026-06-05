import { estimateReadingTime } from './reading-time'

describe('estimateReadingTime', () => {
  it('texto curto → 1 min', () => {
    expect(estimateReadingTime('hello world')).toBe(1)
  })
  it('vazio → 1 min', () => {
    expect(estimateReadingTime('')).toBe(1)
  })
  it('~200 palavras/min', () => {
    const words = Array.from({ length: 600 }, () => 'palavra').join(' ')
    expect(estimateReadingTime(words)).toBe(3)
  })
})
