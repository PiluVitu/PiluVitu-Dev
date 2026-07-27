import { describe, expect, it } from 'vitest'
import { formatPctRange, formatRange, rotuloCompetencia } from './commitments'

describe('rotuloCompetencia', () => {
  it('formata mês/ano curto', () => {
    expect(rotuloCompetencia('2026-08')).toBe('ago/26')
  })

  it('funciona pro primeiro e último mês do ano', () => {
    expect(rotuloCompetencia('2027-01')).toBe('jan/27')
    expect(rotuloCompetencia('2026-12')).toBe('dez/26')
  })
})

// Task 6 (fatia ⑥, §2/§5 do spec): totals/pct_of_fixed_net viraram FAIXA.
// Degenerada (min === max — o caso comum, competência sem recorrente em
// faixa) mostra UM número; faixa de verdade mostra "min a max".
describe('formatRange', () => {
  it('faixa degenerada (min === max, ex. Starlink fixo) mostra um número só', () => {
    expect(formatRange({ min: 18900, max: 18900 })).toBe('R$ 189,00')
  })

  it('faixa de verdade (ex. DAS R$ 12 a R$ 600) mostra "min a max"', () => {
    expect(formatRange({ min: 1200, max: 60000 })).toBe('R$ 12,00 a R$ 600,00')
  })
})

describe('formatPctRange', () => {
  it('faixa degenerada mostra um número só, sem repetir', () => {
    expect(formatPctRange({ min: 60, max: 60 })).toBe('60%')
  })

  it('faixa de verdade mostra "min% a max%"', () => {
    expect(formatPctRange({ min: 36, max: 44 })).toBe('36% a 44%')
  })
})
