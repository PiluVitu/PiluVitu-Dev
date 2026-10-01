import { sfc32 } from './prng'
import { gerarSenha, senhaAtendeRegrasComuns, SIMBOLOS } from './senha'
import { sementes } from './rng-teste'

describe('senha', () => {
  test('1000 sementes: 12 caracteres com maiúscula, minúscula, dígito, símbolo, começando por letra', () => {
    for (const r of sementes(1000)) {
      const s = gerarSenha(r)
      expect(s).toHaveLength(12)
      expect(senhaAtendeRegrasComuns(s)).toBe(true)
      expect(s).not.toMatch(/[0O1lI]/)
    }
  })

  test('respeita os tamanhos 12 e 16 e recusa fora disso', () => {
    expect(gerarSenha(sfc32(1, 1, 1, 1), 12)).toHaveLength(12)
    expect(gerarSenha(sfc32(1, 1, 1, 1), 16)).toHaveLength(16)
    expect(() => gerarSenha(sfc32(1, 1, 1, 1), 8)).toThrow()
    expect(() => gerarSenha(sfc32(1, 1, 1, 1), 17)).toThrow()
  })

  test('símbolos sem tecla morta do ABNT2', () => {
    expect(SIMBOLOS).toBe('!@#$%&*')
    expect(SIMBOLOS).not.toMatch(/[\^~`´'"\\<> -]/)
  })
})
