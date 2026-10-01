import { sfc32 } from './prng'
import { gerarCPF, validarCPF } from './cpf'
import { UFS, REGIAO_FISCAL_CPF } from './uf'
import { sementes, sequencia } from './rng-teste'

describe('CPF', () => {
  test('gerarCPF retorna formato 000.000.000-00', () => {
    const cpf = gerarCPF()
    expect(cpf).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
  })

  test('todos os CPFs gerados são válidos', () => {
    for (let i = 0; i < 500; i++) {
      expect(validarCPF(gerarCPF())).toBe(true)
    }
  })

  test('rejeita CPFs com dígitos iguais', () => {
    for (let d = 0; d <= 9; d++) {
      const repeated = `${d}${d}${d}.${d}${d}${d}.${d}${d}${d}-${d}${d}`
      expect(validarCPF(repeated)).toBe(false)
    }
  })

  test('rejeita CPF com tamanho errado', () => {
    expect(validarCPF('123.456.789')).toBe(false)
    expect(validarCPF('')).toBe(false)
  })

  test('rejeita CPF com dígito verificador errado', () => {
    expect(validarCPF('529.982.247-00')).toBe(false)
  })

  test('aceita CPF sem formatação', () => {
    const formatted = gerarCPF()
    const raw = formatted.replace(/\D/g, '')
    expect(validarCPF(raw)).toBe(true)
  })
})

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
    for (const r of sementes(1000)) expect(validarCPF(gerarCPF(r))).toBe(true)
  })
})
