import {
  CARTOES_TESTE,
  formatarNumeroCartao,
  gerarCartao,
  luhnValido,
} from './cartao'
import { minimo, maximo, sementes } from './rng-teste'

describe('cartão de teste', () => {
  test('o catálogo tem só os números documentados da Stripe', () => {
    expect(CARTOES_TESTE).toEqual([
      { bandeira: 'visa', numero: '4242424242424242' },
      { bandeira: 'mastercard', numero: '5555555555554444' },
    ])
  })

  test.each(CARTOES_TESTE.map((c) => [c.bandeira, c.numero] as const))(
    '%s %s passa no Luhn',
    (_, numero) => {
      expect(luhnValido(numero)).toBe(true)
    },
  )

  test('Luhn recusa dígito trocado e número curto', () => {
    expect(luhnValido('4242424242424241')).toBe(false)
    expect(luhnValido('42424242')).toBe(false)
  })

  test('formata em grupos de 4', () => {
    expect(formatarNumeroCartao('4242424242424242')).toBe('4242 4242 4242 4242')
  })

  test('validade entre hoje + 12 e hoje + 59 meses, CVV de 3 dígitos', () => {
    expect(gerarCartao(minimo, '2026-10-01', 'MARIA E SOUZA')).toEqual({
      bandeira: 'visa',
      numero: '4242424242424242',
      numeroFormatado: '4242 4242 4242 4242',
      titular: 'MARIA E SOUZA',
      validade: '10/27',
      mes: '10',
      ano: '27',
      cvv: '100',
    })
    expect(gerarCartao(maximo, '2026-10-01', 'MARIA E SOUZA')).toMatchObject({
      bandeira: 'mastercard',
      validade: '09/31',
      cvv: '999',
    })
    for (const r of sementes(300)) {
      const c = gerarCartao(r, '2026-10-01', 'MARIA E SOUZA')
      const [mm, aa] = c.validade.split('/').map(Number)
      expect(2000 + aa > 2026 || (2000 + aa === 2026 && mm >= 10)).toBe(true)
      expect(c.cvv).toMatch(/^\d{3}$/)
      expect(`${c.mes}/${c.ano}`).toBe(c.validade)
    }
  })
})
