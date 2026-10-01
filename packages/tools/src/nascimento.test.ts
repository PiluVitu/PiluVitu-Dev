import {
  gerarNascimento,
  calcularIdade,
  lerDataISO,
  formatarISO,
  formatarBR,
} from './nascimento'
import { minimo, maximo, sementes } from './rng-teste'

describe('nascimento', () => {
  test('limites em 2026-10-01: mais novo faz 18 hoje, mais velho tem 65', () => {
    expect(gerarNascimento(maximo, '2026-10-01')).toEqual({
      iso: '2008-10-01',
      br: '01/10/2008',
      idade: 18,
    })
    expect(gerarNascimento(minimo, '2026-10-01')).toEqual({
      iso: '1960-10-02',
      br: '02/10/1960',
      idade: 65,
    })
  })

  test('hoje em 29/02: limites caem em 28/02 e 01/03', () => {
    expect(gerarNascimento(maximo, '2028-02-29').iso).toBe('2010-02-28')
    expect(gerarNascimento(minimo, '2028-02-29').iso).toBe('1962-03-01')
  })

  test('nascido em 29/02 só faz aniversário em 01/03 nos anos não bissextos', () => {
    expect(
      calcularIdade(lerDataISO('2008-02-29'), lerDataISO('2026-02-28')),
    ).toBe(17)
    expect(
      calcularIdade(lerDataISO('2008-02-29'), lerDataISO('2026-03-01')),
    ).toBe(18)
  })

  test('idade em [18, 65] para todo dia de 2024 a 2032', () => {
    const rs = sementes(3)
    for (
      let t = Date.UTC(2024, 0, 1);
      t <= Date.UTC(2032, 11, 31);
      t += 86_400_000
    ) {
      const hoje = new Date(t).toISOString().slice(0, 10)
      for (const r of [minimo, maximo, ...rs]) {
        const n = gerarNascimento(r, hoje)
        expect(n.idade).toBeGreaterThanOrEqual(18)
        expect(n.idade).toBeLessThanOrEqual(65)
        expect(n.iso < hoje).toBe(true)
      }
    }
  })

  test('rejeita data inexistente', () => {
    expect(() => gerarNascimento(minimo, '2026-02-30')).toThrow()
  })

  test('rejeita formato que não é aaaa-mm-dd', () => {
    expect(() => lerDataISO('01/10/2026')).toThrow()
    expect(() => lerDataISO('2026-10-1')).toThrow()
  })

  test('formata ISO e BR com zeros à esquerda', () => {
    const d = { ano: 1993, mes: 5, dia: 9 }
    expect(formatarISO(d)).toBe('1993-05-09')
    expect(formatarBR(d)).toBe('09/05/1993')
  })
})
