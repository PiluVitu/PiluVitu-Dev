import { describe, expect, it } from 'vitest'
import {
  AVISO_SEM_CAMPOS,
  avisoFalhaInserir,
  encontreiCampos,
  linhaNaoReconhecidos,
  tituloPreenchimento,
} from './textos'

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

describe('encontreiCampos', () => {
  it('concorda com Y', () => {
    expect(encontreiCampos(3)).toBe('Encontrei 3 campos')
    expect(encontreiCampos(1)).toBe('Encontrei 1 campo')
  })
})

describe('avisos de falha', () => {
  it('o Inserir diz por que não deu', () => {
    expect(avisoFalhaInserir('sem-foco')).toBe(
      'Não deu para inserir aqui: nenhum campo em foco',
    )
    expect(avisoFalhaInserir('iframe')).toBe(
      'Não deu para inserir aqui: iframe de outro domínio',
    )
    expect(avisoFalhaInserir('recusado')).toBe(
      'Não deu para inserir aqui: o campo recusou o valor',
    )
  })

  it('página sem campo', () => {
    expect(AVISO_SEM_CAMPOS).toBe('Nenhum campo nesta página')
  })
})
