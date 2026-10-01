import { gerarCPF, validarCPF } from './cpf'

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
