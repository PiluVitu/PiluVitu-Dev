import {
  ERROS_DO_ARQUIVO,
  TEXTOS,
  arquivos,
  formatarPorcentagem,
  formatarTamanho,
  paginas,
} from './textos'

describe('formatarTamanho', () => {
  it.each([
    [512, '512 bytes'],
    [120_400, '120,4 kB'],
    [3_450_000, '3,5 MB'],
    [100_000_000, '100 MB'],
    [1_200_000_000, '1,2 GB'],
  ])(
    '%d bytes viram %s, com vírgula decimal e unidade do Intl',
    (bytes, texto) => {
      expect(formatarTamanho(bytes)).toBe(texto)
    },
  )
})

it('plural pelo Intl.PluralRules do pt-BR', () => {
  expect(paginas(1)).toBe('1 página')
  expect(paginas(12)).toBe('12 páginas')
  expect(paginas(1500)).toBe('1.500 páginas')
  expect(arquivos(2)).toBe('2 arquivos')
})

it('porcentagem pelo Intl', () => {
  expect(formatarPorcentagem(0.456)).toBe('46%')
})

it('o aviso de privacidade diz que nada sai do aparelho', () => {
  expect(TEXTOS.privacidade.titulo).toBe('Seus arquivos não saem do aparelho')
  expect(TEXTOS.privacidade.texto).toContain('Nenhum PDF é enviado')
})

it('o limite diz o teto e o porquê', () => {
  const texto = TEXTOS.limites(100_000_000)
  expect(texto).toContain('Até 100 MB somando todos os arquivos')
  expect(texto).toContain('memória do seu aparelho')
})

it('todo erro de arquivo diz o que houve e, quando dá, o que fazer', () => {
  expect(Object.keys(ERROS_DO_ARQUIVO).sort()).toEqual([
    'corrompido',
    'nao_e_pdf',
    'protegido',
    'sem_paginas',
  ])
  expect(ERROS_DO_ARQUIVO.protegido).toMatch(/senha.*Tire a proteção/)
  expect(ERROS_DO_ARQUIVO.nao_e_pdf).toMatch(/Escolha um arquivo \.pdf/)
})
