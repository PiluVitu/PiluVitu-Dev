import { describe, expect, it } from 'vitest'
import { abaixoDaMeta, formatMeses } from './reserve'

describe('formatMeses', () => {
  it('faixa degenerada (min === max) mostra UM número, sem "entre"', () => {
    expect(formatMeses({ min: 3, max: 3 })).toBe('3,0 meses')
  })

  it('faixa aberta mostra "entre min e max meses" — o exemplo literal do spec', () => {
    expect(formatMeses({ min: 2.1, max: 4.8 })).toBe('entre 2,1 e 4,8 meses')
  })

  it('arredonda pra 1 casa decimal, vírgula (pt-BR)', () => {
    // 100000/78900 = 1.267...  100000/20100 = 4.975...
    expect(formatMeses({ min: 100000 / 78900, max: 100000 / 20100 })).toBe(
      'entre 1,3 e 5,0 meses',
    )
  })
})

describe('abaixoDaMeta — o alerta olha o PISO, nunca o teto', () => {
  it('meses: null nunca dispara alerta (nada calculável, não é risco confirmado)', () => {
    expect(abaixoDaMeta(null, 3)).toBe(false)
  })

  // Espelho do teste de limiar do Comprometido, lado invertido: lá o TETO é
  // o perigo (`pct.max > LIMIAR`); aqui o PISO é o perigo. Faixa aberta de
  // propósito (min < max) — uma faixa degenerada passaria mesmo com a
  // comparação invertida por engano, sem provar nada.
  it('piso abaixo da meta e teto acima ⇒ alerta (mesmo cenário da tela real)', () => {
    expect(abaixoDaMeta({ min: 2, max: 5 }, 3)).toBe(true)
  })

  it('piso igual à meta (não estritamente abaixo) ⇒ sem alerta — mesmo ">" não-inclusivo do Comprometido', () => {
    expect(abaixoDaMeta({ min: 3, max: 5 }, 3)).toBe(false)
  })

  it('piso acima da meta ⇒ sem alerta', () => {
    expect(abaixoDaMeta({ min: 4, max: 6 }, 3)).toBe(false)
  })

  // Prova de que é o PISO que decide, não o teto: teto MUITO acima da meta
  // não é o suficiente pra suprimir o alerta se o piso continuar abaixo —
  // uma implementação que checasse o teto por engano (cópia do Comprometido
  // sem inverter o lado) passaria "sem alerta" aqui, errado.
  it('teto bem acima da meta não esconde um piso abaixo dela', () => {
    expect(abaixoDaMeta({ min: 1, max: 50 }, 3)).toBe(true)
  })
})
