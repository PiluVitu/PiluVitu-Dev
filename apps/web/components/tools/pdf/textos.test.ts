import {
  ERROS_DO_ARQUIVO,
  TEXTOS,
  TEXTOS_DO_MODO,
  arquivos,
  formatarGraus,
  formatarPorcentagem,
  formatarTamanho,
  paginas,
  type TextosDoModo,
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

describe('editar', () => {
  const { falhaAoSalvar, anuncios, paginaAtual, zoom } = TEXTOS.editar

  it('posição, zoom e anúncios pelo Intl', () => {
    expect(paginaAtual(3, 1200)).toBe('Página 3 de 1.200')
    expect(zoom.valor(1.25)).toBe('125%')
    expect(anuncios.zoom(0.5)).toBe('Zoom em 50%.')
    expect(anuncios.pagina(2, 5)).toBe('Página 2 de 5.')
  })

  it('texto fora das fontes do PDF: a página (contada de 1), os caracteres pelo Intl e o que fazer', () => {
    expect(
      falhaAoSalvar({
        motivo: 'texto_fora_do_winansi',
        pagina: 2,
        objeto: 't1',
        caracteres: ['😀'],
      }),
    ).toBe(
      'Um texto da página 3 tem um caractere que as fontes do PDF não escrevem: 😀. Apague esse caractere e salve de novo.',
    )
    expect(
      falhaAoSalvar({
        motivo: 'texto_fora_do_winansi',
        pagina: 0,
        objeto: 't1',
        caracteres: ['😀', '✓', '中'],
      }),
    ).toBe(
      'Um texto da página 1 tem caracteres que as fontes do PDF não escrevem: 😀, ✓ e 中. Apague esses caracteres e salve de novo.',
    )
  })

  it('imagem que não é PNG nem JPEG e imagem que não se deixa ler: a página e o que fazer', () => {
    expect(
      falhaAoSalvar({ motivo: 'imagem_nao_aceita', pagina: 0, objeto: 'i1' }),
    ).toBe(
      'Uma imagem da página 1 não é PNG nem JPEG. Troque por uma imagem PNG ou JPEG e salve de novo.',
    )
    expect(
      falhaAoSalvar({ motivo: 'imagem_corrompida', pagina: 4, objeto: 'i1' }),
    ).toMatch(/^Uma imagem da página 5 não pôde ser lida\. Ponha a imagem/)
  })

  it('erro do arquivo usa a mensagem do mesclar; o resto não acusa o arquivo', () => {
    expect(falhaAoSalvar({ motivo: 'protegido' })).toBe(
      `Não deu para salvar o PDF. ${ERROS_DO_ARQUIVO.protegido}`,
    )
    for (const motivo of ['inesperado', 'cancelado'] as const) {
      expect(falhaAoSalvar({ motivo })).toMatch(
        /^O navegador não conseguiu salvar o PDF/,
      )
    }
  })

  it('acima do teto, diz editar, não organizar', () => {
    expect(
      TEXTOS.editar.grandeDemais('scan.pdf', 80_000_000, 50_000_000),
    ).toContain('que dá para editar no navegador')
  })
})

describe('assinar', () => {
  const { assinar, editar } = TEXTOS

  it('o que muda do editar: os dois tetos, o botão, o motivo, o pronto e o anúncio', () => {
    expect(assinar.grandeDemais('scan.pdf', 80_000_000, 50_000_000)).toBe(
      'scan.pdf tem 80 MB, mais que os 50 MB que dá para assinar no navegador. Divida o PDF em partes menores no programa que o criou e abra uma de cada vez.',
    )
    expect(assinar.paginasDemais('livro.pdf', 1200, 500)).toBe(
      'livro.pdf tem 1.200 páginas, mais que as 500 que dá para assinar de uma vez. Divida o PDF em partes de até 500 páginas no programa que o criou e abra uma de cada vez.',
    )
    expect(assinar.gerar.botao).toBe('Gerar PDF assinado')
    expect(assinar.gerar.pronto).toBe('PDF assinado pronto')
    expect(assinar.gerar.semMudancas).toBe(
      'Ponha a assinatura ou um texto numa página, ou preencha um campo do formulário, para gerar o PDF assinado.',
    )
    expect(assinar.anuncios.pronto(3, 1_200_000)).toBe(
      'PDF assinado pronto: 3 páginas, 1,2 MB.',
    )
  })

  it('o editar continua com os textos dele, com o motivo do Gerar parado em semMudancas', () => {
    expect(editar.gerar.botao).toBe('Gerar PDF editado')
    expect(editar.gerar.semMudancas).toBe(
      'Ponha pelo menos um objeto numa página para gerar o PDF editado.',
    )
    expect(editar.anuncios.pronto(1, 500)).toBe(
      'PDF editado pronto: 1 página, 500 bytes.',
    )
  })

  it('cada modo tem a sua versão de cada texto que muda (TextosDoModo)', () => {
    const { editar: doEditar, assinar: doAssinar } = TEXTOS_DO_MODO
    expect(doEditar).toBe(editar)
    expect(doAssinar).toBe(assinar)
    for (const chave of ['botao', 'semMudancas', 'pronto'] as const) {
      expect(doAssinar.gerar[chave]).not.toBe(doEditar.gerar[chave])
    }
    const textosDe = ({
      grandeDemais,
      paginasDemais,
      anuncios,
    }: TextosDoModo) => [
      grandeDemais('a.pdf', 2, 1),
      paginasDemais('a.pdf', 2, 1),
      anuncios.pronto(1, 1),
    ]
    const doOutro = textosDe(doEditar)
    textosDe(doAssinar).forEach((texto, i) =>
      expect(texto).not.toBe(doOutro[i]),
    )
  })
})
