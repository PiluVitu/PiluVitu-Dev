import { describe, expect, it } from 'vitest'
import {
  formatPctRange,
  formatRange,
  rotuloCompetencia,
  rotuloMesCurto,
} from './commitments'

describe('rotuloCompetencia', () => {
  it('formata mês/ano curto', () => {
    expect(rotuloCompetencia('2026-08')).toBe('ago/26')
  })

  it('funciona pro primeiro e último mês do ano', () => {
    expect(rotuloCompetencia('2027-01')).toBe('jan/27')
    expect(rotuloCompetencia('2026-12')).toBe('dez/26')
  })
})

// ② O tick do eixo X precisou perder o ano pra que as SEIS competências
// coubessem nos ~262px do card da home (medida real do grid md:grid-cols-2).
describe('rotuloMesCurto', () => {
  it('devolve só o mês, sem o ano', () => {
    expect(rotuloMesCurto('2026-08')).toBe('ago')
    expect(rotuloMesCurto('2027-01')).toBe('jan')
  })

  it('é o MESMO nome de mês de rotuloCompetencia — nunca uma segunda tabela de meses', () => {
    // Se alguém duplicasse a lista de meses (ou trocasse a ordem numa das
    // duas), este par divergiria em silêncio e o eixo passaria a rotular um
    // mês diferente do que o tooltip mostra pra MESMA barra.
    for (const c of ['2026-01', '2026-06', '2026-12', '2027-02']) {
      expect(rotuloCompetencia(c).startsWith(rotuloMesCurto(c))).toBe(true)
    }
  })

  it('numa janela de 6 meses nenhum mês repete — é o que torna a abreviação não-ambígua', () => {
    // A garantia que sustenta a decisão de ②: 6 < 12, então dentro da
    // janela do Comprometido dois meses nunca colidem no nome curto. Se
    // alguém esticar a janela pra 12+ meses, esta asserção é o lugar onde a
    // premissa quebra.
    const janela = [
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ]
    expect(new Set(janela.map(rotuloMesCurto)).size).toBe(janela.length)
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
