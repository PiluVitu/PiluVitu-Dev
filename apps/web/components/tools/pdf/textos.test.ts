import {
  ERROS_DO_ARQUIVO,
  TEXTOS,
  arquivos,
  formatarGraus,
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
    'falha_do_navegador',
    'nao_e_pdf',
    'protegido',
    'sem_paginas',
  ])
  expect(ERROS_DO_ARQUIVO.falha_do_navegador).not.toMatch(/corrompido/)
  expect(ERROS_DO_ARQUIVO.protegido).toMatch(/senha.*Tire a proteção/)
  expect(ERROS_DO_ARQUIVO.nao_e_pdf).toMatch(/Escolha um arquivo \.pdf/)
})

it('graus sem o espaço que o Intl põe em pt-BR', () => {
  expect(formatarGraus(90)).toBe('90°')
  expect(formatarGraus(270)).toBe('270°')
})

it('organizar: plural e concordância das páginas pelo Intl', () => {
  const { anuncios, selecionadas } = TEXTOS.organizar
  expect(selecionadas(0)).toBe('Nenhuma página selecionada')
  expect(selecionadas(1)).toBe('1 página selecionada')
  expect(selecionadas(1200)).toBe('1.200 páginas selecionadas')
  expect(anuncios.girada(3, 180)).toBe('Página 3 girada para 180°.')
  expect(anuncios.giradas(2, 'esquerda')).toBe(
    '2 páginas giradas para a esquerda.',
  )
  expect(anuncios.apagadas(1)).toBe('1 página apagada.')
  expect(anuncios.apagadas(2)).toBe('2 páginas apagadas.')
  expect(anuncios.movidas(3, 'depois')).toBe('3 páginas movidas para depois.')
})

it('organizar: acima do teto, diz o tamanho, o teto e sugere dividir', () => {
  expect(
    TEXTOS.organizar.grandeDemais('scan.pdf', 180_000_000, 100_000_000),
  ).toBe(
    'scan.pdf tem 180 MB, mais que os 100 MB que dá para organizar no navegador. Divida o PDF em partes menores no programa que o criou e abra uma de cada vez.',
  )
  expect(TEXTOS.organizar.paginasDemais('livro.pdf', 1200, 500)).toContain(
    'livro.pdf tem 1.200 páginas, mais que as 500 que dá para organizar de uma vez. Divida o PDF',
  )
})

it('o aviso de alcance diz que marcadores e links internos não passam', () => {
  expect(TEXTOS.alcance).toMatch(/marcadores/)
  expect(TEXTOS.alcance).toMatch(/links para outra página do mesmo PDF/)
})
