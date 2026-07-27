import { describe, expect, it } from 'vitest'
import { rotuloCompetencia } from './commitments'

describe('rotuloCompetencia', () => {
  it('formata mês/ano curto', () => {
    expect(rotuloCompetencia('2026-08')).toBe('ago/26')
  })

  it('funciona pro primeiro e último mês do ano', () => {
    expect(rotuloCompetencia('2027-01')).toBe('jan/27')
    expect(rotuloCompetencia('2026-12')).toBe('dez/26')
  })
})
