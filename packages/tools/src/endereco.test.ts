import { LOGRADOUROS, sortearNumero, gerarEndereco } from './endereco'
import { UFS } from './uf'
import { minimo, maximo, sementes } from './rng-teste'

describe('catálogo de logradouros', () => {
  test('34 CEPs cobrindo as 27 UFs, CEPs únicos, formatos corretos', () => {
    expect(LOGRADOUROS).toHaveLength(34)
    expect(new Set(LOGRADOUROS.map((l) => l.uf))).toEqual(new Set(UFS))
    expect(new Set(LOGRADOUROS.map((l) => l.cep)).size).toBe(LOGRADOUROS.length)
    for (const l of LOGRADOUROS) {
      expect(l.cep).toMatch(/^\d{5}-\d{3}$/)
      expect(l.ddd).toMatch(/^[1-9][1-9]$/)
      expect(l.numeracao.min).toBeLessThanOrEqual(l.numeracao.max)
    }
  })

  test.each(LOGRADOUROS.map((l) => [l.cep, l.numeracao] as const))(
    'número dentro da faixa do CEP %s',
    (_, faixa) => {
      for (const r of [minimo, maximo, ...sementes(50)]) {
        const n = sortearNumero(r, faixa)
        expect(n).toBeGreaterThanOrEqual(faixa.min)
        expect(n).toBeLessThanOrEqual(faixa.max)
        if (faixa.lado === 'par') expect(n % 2).toBe(0)
        if (faixa.lado === 'impar') expect(n % 2).toBe(1)
      }
    },
  )
})

describe('gerarEndereco', () => {
  test('filtra pela UF pedida e monta o complemento Apto {andar}{unidade}', () => {
    for (const r of sementes(100)) {
      const e = gerarEndereco(r, 'SP')
      expect(e.uf).toBe('SP')
      expect(e.complemento).toMatch(/^Apto ([1-9]|1\d|20)[1-4]$/)
      expect(e).not.toHaveProperty('numeracao')
    }
  })
})
