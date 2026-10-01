import { sfc32 } from './prng'
import type { Rng } from './aleatorio'
import { gerarCPF, validarCPF } from './cpf'
import { gerarCNPJ, validarCNPJ, validarCNPJAlfanumerico } from './cnpj'
import { gerarRG, validarRG, dvRGSP } from './rg'
import { gerarPIS, validarPIS } from './pis'
import { gerarTituloEleitor, validarTituloEleitor } from './titulo-eleitor'
import { UFS, CODIGO_UF_TITULO, REGIAO_FISCAL_CPF } from './uf'

const seeds = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    sfc32(i, i * 31, i * 17 + 3, 0x9e3779b9 ^ i),
  )
const sequencia = (valores: number[]): Rng => ({ int: () => valores.shift()! })

describe('CPF com Rng injetado', () => {
  test('é determinístico por semente', () => {
    expect(gerarCPF(sfc32(1, 1, 1, 1))).toBe('855.556.330-50')
    expect(gerarCPF(sfc32(7, 7, 7, 7))).toBe('324.553.270-94')
  })

  test('chamada sem argumento continua funcionando (consumidor de apps/web)', () => {
    expect(validarCPF(gerarCPF())).toBe(true)
  })

  test('descarta base com 9 dígitos iguais e segue a sequência', () => {
    const rng = sequencia([
      3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    expect(gerarCPF(rng)).toBe('123.456.789-09')
  })

  test.each(UFS)('nono dígito segue a região fiscal de %s', (uf) => {
    const cpf = gerarCPF(sfc32(5, 6, 7, 8), uf)
    expect(Number(cpf[10])).toBe(REGIAO_FISCAL_CPF[uf])
    expect(validarCPF(cpf)).toBe(true)
  })

  test('1000 sementes geram CPFs válidos', () => {
    for (const r of seeds(1000)) expect(validarCPF(gerarCPF(r))).toBe(true)
  })
})

describe('CNPJ com Rng injetado', () => {
  test('é determinístico e válido', () => {
    expect(gerarCNPJ(sfc32(1, 1, 1, 1))).toBe('85.555.633/0001-19')
    for (const r of seeds(1000)) expect(validarCNPJ(gerarCNPJ(r))).toBe(true)
  })

  test('alfanumérico: exemplo oficial da Receita (12.ABC.345/01DE-35)', () => {
    expect(validarCNPJAlfanumerico('12.ABC.345/01DE-35')).toBe(true)
    expect(validarCNPJAlfanumerico('12.ABC.345/01DE-36')).toBe(false)
    expect(validarCNPJAlfanumerico('11.222.333/0001-81')).toBe(true)
  })
})

describe('RG (modelo SSP-SP)', () => {
  test.each([
    ['56.843.539-4'],
    ['24.678.131-2'],
    ['38.452.917-3'],
    ['10.000.006-X'],
    ['10.000.001-0'],
  ])('aceita %s', (rg) => expect(validarRG(rg)).toBe(true))

  test('rejeita o RG do protótipo do design (DV calculado como o resto, não 11 - resto)', () => {
    expect(validarRG('38.452.917-8')).toBe(false)
    expect(dvRGSP([3, 8, 4, 5, 2, 9, 1, 7])).toBe('3')
  })

  test('por padrão nunca gera DV X; com permitirX gera', () => {
    const gerados = seeds(1000).map((r) => gerarRG(r))
    expect(gerados.every((rg) => validarRG(rg) && !rg.endsWith('X'))).toBe(true)
    const comX = seeds(1000).map((r) => gerarRG(r, { permitirX: true }))
    expect(comX.some((rg) => rg.endsWith('X'))).toBe(true)
    expect(comX.every(validarRG)).toBe(true)
  })
})

describe('PIS/PASEP/NIS', () => {
  test.each([['120.12345.67-2'], ['170.00000.01-3'], ['123.45678.90-0']])(
    'aceita %s',
    (pis) => expect(validarPIS(pis)).toBe(true),
  )

  test('rejeita DV errado e dígitos repetidos', () => {
    expect(validarPIS('120.12345.67-5')).toBe(false)
    expect(validarPIS('111.11111.11-1')).toBe(false)
  })

  test('formato 000.00000.00-0 e 1000 sementes válidas', () => {
    for (const r of seeds(1000)) {
      const pis = gerarPIS(r)
      expect(pis).toMatch(/^\d{3}\.\d{5}\.\d{2}-\d$/)
      expect(validarPIS(pis)).toBe(true)
    }
  })
})

describe('Título de eleitor', () => {
  test('exemplo da Wikipédia (SC): 0043 5687 0906', () => {
    expect(validarTituloEleitor('0043 5687 0906', 'sem-excecao')).toBe(true)
    expect(validarTituloEleitor('0043 5687 0906', 'com-excecao-sp-mg')).toBe(
      true,
    )
  })

  test('caso SP em que as duas leituras da regra divergem', () => {
    expect(validarTituloEleitor('0000 0014 0108', 'sem-excecao')).toBe(true)
    expect(validarTituloEleitor('0000 0014 0108', 'com-excecao-sp-mg')).toBe(
      false,
    )
    expect(validarTituloEleitor('0000 0014 0116', 'com-excecao-sp-mg')).toBe(
      true,
    )
  })

  test.each([...UFS, 'ZZ' as const])(
    'código da UF %s nas posições 9-10',
    (uf) => {
      const t = gerarTituloEleitor(sfc32(9, 9, 9, 9), uf).replace(/\s/g, '')
      expect(t.slice(8, 10)).toBe(CODIGO_UF_TITULO[uf])
    },
  )

  test('SP e MG: 2000 sementes válidas nas DUAS leituras da regra', () => {
    for (const r of seeds(2000)) {
      for (const uf of ['SP', 'MG'] as const) {
        const t = gerarTituloEleitor(r, uf)
        expect(t).toMatch(/^\d{4} \d{4} \d{4}$/)
        expect(validarTituloEleitor(t, 'sem-excecao')).toBe(true)
        expect(validarTituloEleitor(t, 'com-excecao-sp-mg')).toBe(true)
      }
    }
  })
})
