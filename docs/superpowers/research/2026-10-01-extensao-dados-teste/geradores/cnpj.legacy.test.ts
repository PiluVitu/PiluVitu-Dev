import { gerarCNPJ, validarCNPJ } from './cnpj'

describe('CNPJ', () => {
  test('gerarCNPJ retorna formato 00.000.000/0000-00', () => {
    const cnpj = gerarCNPJ()
    expect(cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/)
  })

  test('todos os CNPJs gerados são válidos', () => {
    for (let i = 0; i < 500; i++) {
      expect(validarCNPJ(gerarCNPJ())).toBe(true)
    }
  })

  test('rejeita CNPJs com todos os dígitos iguais', () => {
    for (let d = 0; d <= 9; d++) {
      const repeated = `${d}`.repeat(14)
      expect(validarCNPJ(repeated)).toBe(false)
    }
  })

  test('rejeita CNPJ com tamanho errado', () => {
    expect(validarCNPJ('12.345.678')).toBe(false)
    expect(validarCNPJ('')).toBe(false)
  })

  test('rejeita CNPJ com dígito verificador errado', () => {
    expect(validarCNPJ('11.222.333/0001-00')).toBe(false)
  })

  test('aceita CNPJ sem formatação', () => {
    const formatted = gerarCNPJ()
    const raw = formatted.replace(/\D/g, '')
    expect(validarCNPJ(raw)).toBe(true)
  })
})
