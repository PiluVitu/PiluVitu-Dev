import { describe, expect, it } from 'vitest'
import { linhaNaoReconhecidos, tituloPreenchimento } from './textos'

describe('tituloPreenchimento', () => {
  it('concorda com Y', () => {
    expect(tituloPreenchimento(12, 14)).toBe('12 de 14 campos preenchidos')
    expect(tituloPreenchimento(1, 1)).toBe('1 de 1 campo preenchido')
    expect(tituloPreenchimento(0, 1)).toBe('0 de 1 campo preenchido')
    expect(tituloPreenchimento(0, 2)).toBe('0 de 2 campos preenchidos')
  })
})

describe('linhaNaoReconhecidos', () => {
  it('concorda com k', () => {
    expect(linhaNaoReconhecidos(2)).toBe('2 não reconhecidos')
    expect(linhaNaoReconhecidos(1)).toBe('1 não reconhecido')
  })
})
