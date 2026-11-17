import {
  ALTURA_DA_LINHA,
  LADO_MAXIMO_DO_CANVAS,
  LADO_MINIMO,
  LIMITE_DO_HISTORICO,
  METRICAS_DAS_FONTES,
  NOME_PADRAO_DO_PDF_FINAL,
  PASSO_CURTO,
  PASSO_LONGO,
  PIXELS_MAXIMOS_DO_CANVAS,
  TAMANHO_MAXIMO_DO_TEXTO,
  TAMANHO_MINIMO_DO_TEXTO,
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  TETO_TOTAL_EM_BYTES,
  alturaDoTexto,
  apagar,
  aplicarMatriz,
  cabeNoWinAnsi,
  cabemNoTeto,
  caracteresForaDoWinAnsi,
  comTamanhoDeFonte,
  componentesDaCor,
  corValida,
  desfazer,
  extremosDaLinha,
  extrair,
  fracaoDaMesclagem,
  geometriaDaSeta,
  geometriaDaVista,
  girar,
  historicoInicial,
  limitarAPagina,
  limitarAoCanvas,
  linhaEntre,
  linhasDeBase,
  linhasDoTexto,
  matrizDaTelaParaPdf,
  moverObjeto,
  moverSelecionadas,
  nomeDoPdfDerivado,
  nomeDoPdfFinal,
  pdfParaTela,
  pixelsDoFundo,
  planoInicial,
  podeDesfazer,
  podeRefazer,
  pontosDoTracoNaTela,
  redimensionarObjeto,
  refazer,
  registrarNoHistorico,
  tamanhoNaTela,
  telaParaPdf,
  tipoDaImagem,
  tracoDosPontos,
  type Canto,
  type Direcao,
  type GeometriaDaPagina,
  type ObjetoDaPagina,
  type ObjetoLinha,
  type ObjetoTexto,
  type ObjetoTraco,
  type PaginaDoPlano,
  type Ponto,
} from './pdf-regras'

// Os testes do organizar comparam só a ordem dos índices e os giros: é o que o PDF final recebe.
const indices = (plano: readonly PaginaDoPlano[]) => plano.map((p) => p.indice)
const giros = (plano: readonly PaginaDoPlano[]) => plano.map((p) => p.giro)

describe('fracaoDaMesclagem', () => {
  it('começa em 0 e anda pelo tamanho dos arquivos já lidos, até 90%', () => {
    const tamanhos = [10, 30, 60]
    expect(fracaoDaMesclagem(tamanhos, 0)).toBe(0)
    expect(fracaoDaMesclagem(tamanhos, 1)).toBeCloseTo(0.09)
    expect(fracaoDaMesclagem(tamanhos, 2)).toBeCloseTo(0.36)
    expect(fracaoDaMesclagem(tamanhos, 3)).toBeCloseTo(0.9)
  })

  it('salvando fica em 90%; lista vazia fica em 0', () => {
    expect(fracaoDaMesclagem([10], 1, true)).toBe(0.9)
    expect(fracaoDaMesclagem([], 0)).toBe(0)
  })
})

describe('cabemNoTeto', () => {
  it('o teto é de 100 MB', () => {
    expect(TETO_TOTAL_EM_BYTES).toBe(100_000_000)
  })

  it('aceita até somar o teto, inclusive', () => {
    expect(cabemNoTeto(0, [60, 40], 100)).toEqual([true, true])
  })

  it('recusa o que passa e continua tentando os menores que vêm depois', () => {
    expect(cabemNoTeto(50, [60, 30, 30], 100)).toEqual([false, true, false])
  })
})

describe('nomeDoPdfFinal', () => {
  it('vazio ou só espaços: mesclado.pdf', () => {
    expect(nomeDoPdfFinal('')).toBe(NOME_PADRAO_DO_PDF_FINAL)
    expect(nomeDoPdfFinal('   ')).toBe('mesclado.pdf')
    expect(nomeDoPdfFinal('.pdf')).toBe('mesclado.pdf')
  })

  it('põe a extensão quando falta e não repete quando já tem', () => {
    expect(nomeDoPdfFinal('contrato assinado')).toBe('contrato assinado.pdf')
    expect(nomeDoPdfFinal('Contrato.PDF')).toBe('Contrato.pdf')
  })

  it('tira barras, caracteres de controle e os proibidos no Windows', () => {
    expect(nomeDoPdfFinal('../../etc/passwd')).toBe('etc passwd.pdf')
    expect(nomeDoPdfFinal('a:b*c?"d<e>f|g\\h\u0000i')).toBe(
      'a b c d e f g h i.pdf',
    )
  })

  it('mantém acento e corta nomes longos', () => {
    expect(nomeDoPdfFinal('relatório de ação')).toBe('relatório de ação.pdf')
    expect(nomeDoPdfFinal('x'.repeat(300))).toBe(`${'x'.repeat(120)}.pdf`)
  })
})

describe('nomeDoPdfDerivado', () => {
  it('põe o sufixo depois do nome original, sem repetir o .pdf', () => {
    expect(nomeDoPdfDerivado('contrato.pdf', 'organizado')).toBe(
      'contrato-organizado.pdf',
    )
    expect(nomeDoPdfDerivado('Relatório Final.PDF', 'paginas')).toBe(
      'Relatório Final-paginas.pdf',
    )
    expect(nomeDoPdfDerivado('mesclado.pdf', 'organizado')).toBe(
      'mesclado-organizado.pdf',
    )
  })

  it('passa pelo nomeDoPdfFinal: tira o que não pode ir no nome do arquivo', () => {
    expect(nomeDoPdfDerivado('../a:b*c.pdf', 'organizado')).toBe(
      'a b c-organizado.pdf',
    )
  })

  it('nome longo: corta o original e mantém o sufixo inteiro', () => {
    const nome = nomeDoPdfDerivado(`${'x'.repeat(300)}.pdf`, 'organizado')
    expect(nome).toBe(`${'x'.repeat(109)}-organizado.pdf`)
    expect(nome.length).toBe(124)
  })

  it('o corte não deixa ponto nem espaço colado no sufixo', () => {
    const nome = nomeDoPdfDerivado(`${'x'.repeat(110)}. fim.pdf`, 'paginas')
    expect(nome).toBe(`${'x'.repeat(110)}-paginas.pdf`)
  })
})

describe('tetos do modo com miniaturas', () => {
  it('TETO_DE_PAGINAS é de 500 páginas', () => {
    expect(TETO_DE_PAGINAS).toBe(500)
  })

  it('TETO_DE_BYTES_COM_MINIATURAS é de 50 MB, metade do mesclar', () => {
    expect(TETO_DE_BYTES_COM_MINIATURAS).toBe(50_000_000)
    expect(TETO_DE_BYTES_COM_MINIATURAS).toBeLessThan(TETO_TOTAL_EM_BYTES)
  })
})

describe('planoInicial', () => {
  it('uma entrada por página, na ordem do arquivo e sem giro', () => {
    expect(planoInicial(3)).toEqual([
      { indice: 0, giro: 0 },
      { indice: 1, giro: 0 },
      { indice: 2, giro: 0 },
    ])
  })

  it('documento sem página dá plano vazio', () => {
    expect(planoInicial(0)).toEqual([])
  })

  it.each([-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'recusa total %p com RangeError',
    (total) => {
      expect(() => planoInicial(total)).toThrow(RangeError)
    },
  )
})

describe('girar', () => {
  it('à direita soma 90 e passa de 270 para 0', () => {
    let plano = planoInicial(1)
    const vistos: number[] = []
    for (let i = 0; i < 4; i++) {
      plano = girar(plano, [0], 'direita')
      vistos.push(plano[0].giro)
    }
    expect(vistos).toEqual([90, 180, 270, 0])
  })

  it('à esquerda a partir de 0 dá 270, e segue descendo até voltar a 0', () => {
    let plano = planoInicial(1)
    const vistos: number[] = []
    for (let i = 0; i < 4; i++) {
      plano = girar(plano, [0], 'esquerda')
      vistos.push(plano[0].giro)
    }
    expect(vistos).toEqual([270, 180, 90, 0])
  })

  it('gira só as posições escolhidas, mesmo fora de sequência, e aceita um Set', () => {
    const plano = girar(planoInicial(5), new Set([0, 3]), 'direita')
    expect(giros(plano)).toEqual([90, 0, 0, 90, 0])
    expect(indices(plano)).toEqual([0, 1, 2, 3, 4])
  })

  it('a posição é a do plano atual, não o índice da página no arquivo', () => {
    const invertido: PaginaDoPlano[] = [
      { indice: 2, giro: 0 },
      { indice: 1, giro: 0 },
      { indice: 0, giro: 0 },
    ]
    expect(girar(invertido, [0], 'direita')[0]).toEqual({
      indice: 2,
      giro: 90,
    })
  })

  it('posição repetida conta uma vez só', () => {
    expect(giros(girar(planoInicial(2), [1, 1], 'direita'))).toEqual([0, 90])
  })

  it('seleção vazia devolve um plano igual', () => {
    expect(girar(planoInicial(2), [], 'direita')).toEqual(planoInicial(2))
  })
})

describe('moverSelecionadas', () => {
  it('uma página anda uma posição para antes e para depois', () => {
    expect(indices(moverSelecionadas(planoInicial(4), [2], 'antes'))).toEqual([
      0, 2, 1, 3,
    ])
    expect(indices(moverSelecionadas(planoInicial(4), [1], 'depois'))).toEqual([
      0, 2, 1, 3,
    ])
  })

  it('um bloco contíguo anda junto, sem trocar a ordem entre as escolhidas', () => {
    expect(
      indices(moverSelecionadas(planoInicial(5), [2, 3], 'antes')),
    ).toEqual([0, 2, 3, 1, 4])
    expect(
      indices(moverSelecionadas(planoInicial(5), [1, 2], 'depois')),
    ).toEqual([0, 3, 1, 2, 4])
  })

  it('a página na ponta não sai do lugar', () => {
    expect(indices(moverSelecionadas(planoInicial(3), [0], 'antes'))).toEqual([
      0, 1, 2,
    ])
    expect(indices(moverSelecionadas(planoInicial(3), [2], 'depois'))).toEqual([
      0, 1, 2,
    ])
    expect(
      indices(moverSelecionadas(planoInicial(3), [0, 1], 'antes')),
    ).toEqual([0, 1, 2])
  })

  it('seleção não contígua: a que encostou na ponta fica, e as outras andam sem passar por ela', () => {
    expect(
      indices(moverSelecionadas(planoInicial(5), [0, 2, 4], 'antes')),
    ).toEqual([0, 2, 1, 4, 3])
    expect(
      indices(moverSelecionadas(planoInicial(5), [0, 2, 4], 'depois')),
    ).toEqual([1, 0, 3, 2, 4])
  })

  it('apertar de novo junta as escolhidas na ponta, na ordem em que estavam', () => {
    let plano = planoInicial(6)
    let posicoes = [1, 3, 5]
    for (let i = 0; i < 6; i++) {
      plano = moverSelecionadas(plano, posicoes, 'antes')
      posicoes = posicoes.map((_, j) =>
        plano.findIndex((p) => p.indice === [1, 3, 5][j]),
      )
    }
    expect(indices(plano)).toEqual([1, 3, 5, 0, 2, 4])
  })

  it('leva o giro junto com a página', () => {
    const plano = girar(planoInicial(3), [2], 'direita')
    expect(moverSelecionadas(plano, [2], 'antes')[1]).toEqual({
      indice: 2,
      giro: 90,
    })
  })

  it('seleção vazia devolve um plano igual', () => {
    expect(moverSelecionadas(planoInicial(3), [], 'depois')).toEqual(
      planoInicial(3),
    )
  })
})

describe('apagar', () => {
  it('tira as posições escolhidas e mantém a ordem do resto', () => {
    const plano = moverSelecionadas(planoInicial(5), [4], 'antes')
    expect(indices(apagar(plano, [0, 3]))).toEqual([1, 2, 3])
  })

  it('apagar tudo dá plano vazio', () => {
    expect(apagar(planoInicial(2), [0, 1])).toEqual([])
  })

  it('seleção vazia devolve um plano igual', () => {
    expect(apagar(planoInicial(2), [])).toEqual(planoInicial(2))
  })
})

describe('extrair', () => {
  it('devolve só as escolhidas, na ordem atual do plano e com o giro', () => {
    const plano = girar(
      moverSelecionadas(planoInicial(4), [3], 'antes'),
      [2],
      'esquerda',
    )
    // plano: 0, 1, 3 (270°), 2
    expect(extrair(plano, new Set([3, 0, 2]))).toEqual([
      { indice: 0, giro: 0 },
      { indice: 3, giro: 270 },
      { indice: 2, giro: 0 },
    ])
  })

  it('seleção vazia dá plano vazio', () => {
    expect(extrair(planoInicial(3), [])).toEqual([])
  })
})

describe('as funções do organizar', () => {
  type Operacao = (
    plano: readonly PaginaDoPlano[],
    posicoes: number[],
  ) => PaginaDoPlano[]
  const operacoes: Record<string, Operacao> = {
    girar: (plano, posicoes) => girar(plano, posicoes, 'direita'),
    moverSelecionadas: (plano, posicoes) =>
      moverSelecionadas(plano, posicoes, 'antes'),
    apagar,
    extrair,
  }

  it.each(Object.entries(operacoes))(
    '%s não muda o plano recebido',
    (_nome, operacao) => {
      const plano = Object.freeze(
        planoInicial(4).map((p) => Object.freeze({ ...p })),
      )
      const copia = plano.map((p) => ({ ...p }))
      const resultado = operacao(plano, [1, 3])
      expect(plano).toEqual(copia)
      expect(resultado).not.toBe(plano)
    },
  )

  it.each(Object.entries(operacoes))(
    '%s recusa posição fora do plano ou não inteira com RangeError',
    (_nome, operacao) => {
      const plano = planoInicial(3)
      for (const posicao of [-1, 3, 1.5, Number.NaN]) {
        expect(() => operacao(plano, [posicao])).toThrow(RangeError)
      }
    },
  )
})

// Fase 3: objetos por cima da página.

const pertoDe = (ponto: Ponto, esperado: Ponto) => {
  expect(ponto.x).toBeCloseTo(esperado.x, 9)
  expect(ponto.y).toBeCloseTo(esperado.y, 9)
}

// CropBox [50 100 450 700] dentro de uma MediaBox maior: a área visível não começa no zero.
const comCorte = (rotacao: 0 | 90 | 180 | 270): GeometriaDaPagina => ({
  caixa: { x: 50, y: 100, largura: 400, altura: 600 },
  rotacao,
  unidade: 1,
})

describe('conversão entre a tela e o PDF', () => {
  // Cada caso: o tamanho na tela e para onde vão o canto superior esquerdo da tela, um ponto (10, 20) e o
  // canto inferior direito. Contas feitas à mão a partir da PageViewport do pdf.js (o teste do pdf.ts
  // confere o mesmo contra o pdf.js de verdade).
  it.each([
    [
      0,
      { largura: 400, altura: 600 },
      { x: 50, y: 700 },
      { x: 60, y: 680 },
      { x: 450, y: 100 },
    ],
    [
      90,
      { largura: 600, altura: 400 },
      { x: 50, y: 100 },
      { x: 70, y: 110 },
      { x: 450, y: 700 },
    ],
    [
      180,
      { largura: 400, altura: 600 },
      { x: 450, y: 100 },
      { x: 440, y: 120 },
      { x: 50, y: 700 },
    ],
    [
      270,
      { largura: 600, altura: 400 },
      { x: 450, y: 700 },
      { x: 430, y: 690 },
      { x: 50, y: 100 },
    ],
  ] as const)(
    '/Rotate %i com CropBox deslocado',
    (rotacao, tamanho, origem, ponto, fim) => {
      const geometria = comCorte(rotacao)
      expect(tamanhoNaTela(geometria)).toEqual(tamanho)
      pertoDe(telaParaPdf(geometria, { x: 0, y: 0 }), origem)
      pertoDe(telaParaPdf(geometria, { x: 10, y: 20 }), ponto)
      pertoDe(
        telaParaPdf(geometria, { x: tamanho.largura, y: tamanho.altura }),
        fim,
      )
    },
  )

  it.each([0, 90, 180, 270] as const)(
    'pdfParaTela desfaz telaParaPdf (/Rotate %i)',
    (rotacao) => {
      const geometria = { ...comCorte(rotacao), unidade: 1.5 }
      for (const ponto of [
        { x: 0, y: 0 },
        { x: 33.3, y: 12.5 },
        { x: 250, y: 380 },
      ]) {
        pertoDe(pdfParaTela(geometria, telaParaPdf(geometria, ponto)), ponto)
      }
    },
  )

  it('a matriz leva os cantos da tela aos cantos da área visível do PDF', () => {
    for (const rotacao of [0, 90, 180, 270] as const) {
      const geometria = comCorte(rotacao)
      const { largura, altura } = tamanhoNaTela(geometria)
      const cantos = [
        { x: 0, y: 0 },
        { x: largura, y: 0 },
        { x: 0, y: altura },
        { x: largura, y: altura },
      ].map((p) => aplicarMatriz(matrizDaTelaParaPdf(geometria), p))
      expect(cantos.map(({ x, y }) => `${x} ${y}`).sort()).toEqual(
        ['50 100', '50 700', '450 100', '450 700'].sort(),
      )
    }
  })

  it('a /UserUnit aumenta a página na tela, como no pdf.js', () => {
    const geometria: GeometriaDaPagina = {
      caixa: { x: 0, y: 0, largura: 100, altura: 200 },
      rotacao: 0,
      unidade: 2,
    }
    expect(tamanhoNaTela(geometria)).toEqual({ largura: 200, altura: 400 })
    pertoDe(telaParaPdf(geometria, { x: 20, y: 40 }), { x: 10, y: 180 })
    pertoDe(telaParaPdf(geometria, { x: 200, y: 400 }), { x: 100, y: 0 })
  })

  it('geometriaDaVista aceita o view, o rotate e o userUnit do pdf.js', () => {
    expect(geometriaDaVista([50, 100, 450, 700], 90, 1)).toEqual(comCorte(90))
    expect(geometriaDaVista([0, 0, 10, 10], -90).rotacao).toBe(270)
    expect(geometriaDaVista([0, 0, 10, 10], 450).rotacao).toBe(90)
    expect(geometriaDaVista([0, 0, 10, 10], 0).unidade).toBe(1)
  })

  it.each([
    [[0, 0, 10], 0, 1],
    [[10, 0, 0, 10], 0, 1],
    [[0, 0, 10, NaN], 0, 1],
    [[0, 0, 10, 10], 45, 1],
    [[0, 0, 10, 10], 0, 0],
  ])(
    'geometriaDaVista recusa %j, rotação %i, unidade %i',
    (vista, rotacao, unidade) => {
      expect(() => geometriaDaVista(vista, rotacao, unidade)).toThrow(
        RangeError,
      )
    },
  )
})

describe('WinAnsi (as fontes padrão do PDF)', () => {
  it('aceita os acentos e a pontuação do português e do espanhol', () => {
    expect(
      cabeNoWinAnsi(
        'Ação, coração, pão, você, avó, à, Ñandú, ¿Qué tal? ¡Olé! pingüino, nº 1ª, € 10 — “aspas” ‘simples’ • … ™ Œuvre',
      ),
    ).toBe(true)
  })

  it.each([
    ['emoji', 'Oi 😀'],
    ['CJK', '中文'],
    ['cirílico', 'Привет'],
    ['turco', 'ğ'],
    ['controle', 'a\u0007b'],
    ['controle C1', '\u0081'],
  ])('recusa %s', (_, textoForaDoWinAnsi) => {
    expect(cabeNoWinAnsi(textoForaDoWinAnsi)).toBe(false)
  })

  it('lista cada caractere de fora uma vez, na ordem em que aparece', () => {
    expect(caracteresForaDoWinAnsi('a😀b中😀c')).toEqual(['😀', '中'])
  })

  it('quebra de linha e tabulação não contam', () => {
    expect(
      caracteresForaDoWinAnsi('a\nb\r\nc\td\u2028e\u2029f\u0085g'),
    ).toEqual([])
  })
})

describe('texto', () => {
  it('quebra as linhas em todo tipo de quebra e troca a tabulação por 4 espaços', () => {
    expect(linhasDoTexto('a\nb\r\nc\rd\u2028e')).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
    expect(linhasDoTexto('a\tb')).toEqual(['a    b'])
    expect(linhasDoTexto('')).toEqual([''])
  })

  const umTexto = (extra: Partial<ObjetoTexto> = {}): ObjetoTexto => ({
    id: 't',
    tipo: 'texto',
    x: 10,
    y: 30,
    largura: 100,
    altura: 25,
    conteudo: 'a\nb',
    fonte: 'helvetica',
    negrito: false,
    italico: false,
    tamanho: 20,
    cor: '#000000',
    ...extra,
  })

  it('a primeira linha de base fica um ascendente abaixo do topo, e as outras 1,2 em abaixo', () => {
    const [primeira, segunda] = linhasDeBase(umTexto())
    expect(primeira).toEqual({ conteudo: 'a', x: 10, y: expect.any(Number) })
    expect(primeira.y).toBeCloseTo(30 + 20 * 0.718)
    expect(segunda.y).toBeCloseTo(30 + 20 * (0.718 + ALTURA_DA_LINHA))
    expect(linhasDeBase(umTexto({ fonte: 'times' }))[0].y).toBeCloseTo(
      30 + 20 * METRICAS_DAS_FONTES.times.ascendente,
    )
  })

  it('a altura vai do ascendente da primeira linha ao descendente da última', () => {
    expect(alturaDoTexto('helvetica', 20, 2)).toBeCloseTo(
      20 * (1.2 + 0.718 + 0.207),
    )
    expect(alturaDoTexto('courier', 10, 1)).toBeCloseTo(10 * (0.629 + 0.157))
  })

  it('mudar o tamanho da fonte escala a caixa junto', () => {
    expect(comTamanhoDeFonte(umTexto(), 30)).toMatchObject({
      tamanho: 30,
      largura: 150,
      altura: 37.5,
      x: 10,
      y: 30,
    })
  })
})

describe('cor', () => {
  it.each([
    ['#00ff00', true],
    ['#00FF00', true],
    ['00ff00', false],
    ['#0f0', false],
    ['red', false],
    [123, false],
  ])('%j válida: %s', (cor, valida) => {
    expect(corValida(cor)).toBe(valida)
  })

  it('vira componentes de 0 a 1', () => {
    expect(componentesDaCor('#ff8000')).toEqual([1, 128 / 255, 0])
    expect(() => componentesDaCor('vermelho')).toThrow(RangeError)
  })
})

describe('tipoDaImagem', () => {
  const bytes = (...valores: number[]) => new Uint8Array(valores)
  const ascii = (texto: string) => new TextEncoder().encode(texto)

  it('reconhece PNG e JPEG pelos bytes iniciais', () => {
    expect(
      tipoDaImagem(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    ).toBe('png')
    expect(tipoDaImagem(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg')
  })

  it.each([
    [
      'SVG',
      ascii(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ],
    ['SVG com declaração XML', ascii('<?xml version="1.0"?><svg/>')],
    ['GIF', ascii('GIF89a')],
    ['WebP', ascii('RIFF\0\0\0\0WEBPVP8 ')],
    ['PNG cortado', bytes(0x89, 0x50, 0x4e, 0x47)],
    ['vazio', bytes()],
  ])('recusa %s', (_, conteudo) => {
    expect(tipoDaImagem(conteudo)).toBeNull()
  })
})

describe('linha e seta', () => {
  const caixa = { x: 10, y: 20, largura: 100, altura: 50 }
  const umaLinha = (inicio: Canto): ObjetoLinha => ({
    id: 'l',
    tipo: 'linha',
    ...caixa,
    inicio,
    espessura: 2,
    cor: '#000000',
  })

  it.each([
    ['superior-esquerdo', { x: 10, y: 20 }, { x: 110, y: 70 }],
    ['inferior-esquerdo', { x: 10, y: 70 }, { x: 110, y: 20 }],
    ['superior-direito', { x: 110, y: 20 }, { x: 10, y: 70 }],
    ['inferior-direito', { x: 110, y: 70 }, { x: 10, y: 20 }],
  ] as const)('começa no canto %s e acaba no oposto', (inicio, de, ate) => {
    expect(extremosDaLinha(umaLinha(inicio))).toEqual({ de, ate })
  })

  it('linhaEntre e extremosDaLinha vão e voltam nos quatro sentidos', () => {
    const pares: [Ponto, Ponto][] = [
      [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ],
      [
        { x: 30, y: 40 },
        { x: 0, y: 0 },
      ],
      [
        { x: 0, y: 40 },
        { x: 30, y: 0 },
      ],
      [
        { x: 30, y: 0 },
        { x: 0, y: 40 },
      ],
      [
        { x: 5, y: 5 },
        { x: 5, y: 50 },
      ],
    ]
    for (const [de, ate] of pares) {
      const { inicio, ...resto } = linhaEntre(de, ate)
      expect(extremosDaLinha({ ...umaLinha(inicio), ...resto })).toEqual({
        de,
        ate,
      })
    }
  })

  it('a ponta da seta acaba no fim, e a haste para na base dela', () => {
    expect(geometriaDaSeta({ x: 0, y: 0 }, { x: 100, y: 0 }, 2)).toEqual({
      haste: { de: { x: 0, y: 0 }, ate: { x: 92, y: 0 } },
      ponta: [
        { x: 100, y: 0 },
        { x: 92, y: 4 },
        { x: 92, y: -4 },
      ],
    })
  })

  it('a ponta cresce com a espessura e é simétrica em qualquer direção', () => {
    const { haste, ponta } = geometriaDaSeta(
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      5,
    )
    expect(Math.hypot(haste.ate.x - 30, haste.ate.y - 40)).toBeCloseTo(15)
    const [, b, c] = ponta!
    expect(Math.hypot(b.x - haste.ate.x, b.y - haste.ate.y)).toBeCloseTo(7.5)
    expect(Math.hypot(c.x - haste.ate.x, c.y - haste.ate.y)).toBeCloseTo(7.5)
  })

  it('seta mais curta que a ponta vira só a ponta; sem comprimento, nem ponta', () => {
    const curta = geometriaDaSeta({ x: 0, y: 0 }, { x: 5, y: 0 }, 2)
    expect(curta.haste.ate).toEqual({ x: 0, y: 0 })
    expect(curta.ponta![0]).toEqual({ x: 5, y: 0 })
    expect(geometriaDaSeta({ x: 3, y: 3 }, { x: 3, y: 3 }, 2).ponta).toBeNull()
  })
})

describe('traço', () => {
  it('guarda os pontos em fração da caixa, com a pressão quando há', () => {
    expect(
      tracoDosPontos([
        [10, 20],
        [30, 60],
        [20, 40],
      ]),
    ).toEqual({
      x: 10,
      y: 20,
      largura: 20,
      altura: 40,
      pontos: [
        [0, 0],
        [1, 1],
        [0.5, 0.5],
      ],
    })
    expect(
      tracoDosPontos([
        [10, 20, 0.3],
        [30, 60, 0.7],
      ]).pontos,
    ).toEqual([
      [0, 0, 0.3],
      [1, 1, 0.7],
    ])
  })

  it('traço reto na vertical tem largura zero', () => {
    expect(
      tracoDosPontos([
        [5, 0],
        [5, 10],
      ]),
    ).toMatchObject({
      x: 5,
      largura: 0,
      pontos: [
        [0, 0],
        [0, 1],
      ],
    })
  })

  it('volta para a tela acompanhando a caixa (mover e redimensionar levam o traço junto)', () => {
    const pontos = [
      [10, 20, 0.5],
      [30, 60, 0.5],
    ] as const
    const traco: ObjetoTraco = {
      id: 'd',
      tipo: 'traco',
      ...tracoDosPontos(pontos),
      espessura: 3,
      cor: '#000000',
    }
    expect(pontosDoTracoNaTela(traco)).toEqual(pontos)
    expect(pontosDoTracoNaTela({ ...traco, x: 110, largura: 40 })).toEqual([
      [110, 20, 0.5],
      [150, 60, 0.5],
    ])
  })

  it('aguenta um traço longo (sem passar do limite de argumentos de uma chamada)', () => {
    const pontos = Array.from(
      { length: 200_000 },
      (_, i) => [i % 500, i % 300] as const,
    )
    expect(tracoDosPontos(pontos)).toMatchObject({
      x: 0,
      y: 0,
      largura: 499,
      altura: 299,
    })
  })

  it('traço sem ponto é erro', () => {
    expect(() => tracoDosPontos([])).toThrow(RangeError)
  })
})

describe('mover e redimensionar pelo teclado', () => {
  const pagina = { largura: 200, altura: 100 }
  const retangulo: ObjetoDaPagina = Object.freeze({
    id: 'r',
    tipo: 'retangulo',
    x: 10,
    y: 10,
    largura: 50,
    altura: 20,
    espessura: 1,
    cor: '#000000',
  })

  it('os passos são de 1 e de 10 pontos', () => {
    expect([PASSO_CURTO, PASSO_LONGO]).toEqual([1, 10])
  })

  it.each([
    ['direita', 1, { x: 11, y: 10 }],
    ['direita', 10, { x: 20, y: 10 }],
    ['esquerda', 1, { x: 9, y: 10 }],
    ['baixo', 10, { x: 10, y: 20 }],
    ['cima', 1, { x: 10, y: 9 }],
  ] as const)('move para %s %i ponto(s)', (direcao, passo, posicao) => {
    expect(moverObjeto(retangulo, direcao, passo, pagina)).toMatchObject({
      ...posicao,
      largura: 50,
      altura: 20,
    })
  })

  it('para na borda da página e devolve o mesmo objeto quando não mexe', () => {
    expect(moverObjeto(retangulo, 'esquerda', 10, pagina).x).toBe(0)
    const noCanto = { ...retangulo, x: 150, y: 80 }
    expect(moverObjeto(noCanto, 'direita', 10, pagina)).toBe(noCanto)
    expect(moverObjeto(noCanto, 'baixo', 1, pagina)).toBe(noCanto)
    const naOrigem = { ...retangulo, x: 0, y: 0 }
    expect(moverObjeto(naOrigem, 'esquerda', 1, pagina)).toBe(naOrigem)
    expect(moverObjeto(naOrigem, 'cima', 1, pagina)).toBe(naOrigem)
  })

  it('objeto maior que a página fica encostado no começo', () => {
    expect(
      moverObjeto({ ...retangulo, largura: 300 }, 'direita', 1, pagina).x,
    ).toBe(0)
  })

  it.each([0, -1, NaN, Infinity])('recusa o passo %d', (passo) => {
    expect(() => moverObjeto(retangulo, 'direita', passo, pagina)).toThrow(
      RangeError,
    )
    expect(() =>
      redimensionarObjeto(retangulo, 'direita', passo, pagina),
    ).toThrow(RangeError)
  })

  it.each([
    ['direita', 1, { largura: 51, altura: 20 }],
    ['esquerda', 10, { largura: 40, altura: 20 }],
    ['baixo', 10, { largura: 50, altura: 30 }],
    ['cima', 10, { largura: 50, altura: 10 }],
  ] as const)(
    'redimensiona para %s %i: puxa o canto de baixo à direita',
    (direcao, passo, tamanho) => {
      expect(
        redimensionarObjeto(retangulo, direcao, passo, pagina),
      ).toMatchObject({
        x: 10,
        y: 10,
        ...tamanho,
      })
    },
  )

  it('não cresce além da borda nem encolhe abaixo do lado mínimo', () => {
    const largo = { ...retangulo, largura: 185 }
    expect(redimensionarObjeto(largo, 'direita', 10, pagina).largura).toBe(190)
    const naBorda = { ...retangulo, largura: 190 }
    expect(redimensionarObjeto(naBorda, 'direita', 1, pagina)).toBe(naBorda)
    const fino = { ...retangulo, largura: LADO_MINIMO }
    expect(redimensionarObjeto(fino, 'esquerda', 10, pagina)).toBe(fino)
    expect(
      redimensionarObjeto({ ...retangulo, largura: 5 }, 'esquerda', 10, pagina)
        .largura,
    ).toBe(LADO_MINIMO)
  })

  it('linha, seta e traço podem chegar a zero num dos lados', () => {
    const linha: ObjetoDaPagina = {
      ...retangulo,
      tipo: 'linha',
      inicio: 'superior-esquerdo',
      largura: 5,
    }
    expect(redimensionarObjeto(linha, 'esquerda', 10, pagina).largura).toBe(0)
  })

  it('crescer nunca encolhe, mesmo com o objeto passando da borda', () => {
    const passando = { ...retangulo, x: 180, largura: 50 }
    expect(redimensionarObjeto(passando, 'direita', 1, pagina)).toBe(passando)
    expect(redimensionarObjeto(passando, 'esquerda', 10, pagina).largura).toBe(
      40,
    )
  })

  describe('texto: redimensionar muda a fonte e a caixa junto', () => {
    const texto: ObjetoTexto = Object.freeze({
      id: 't',
      tipo: 'texto',
      x: 10,
      y: 10,
      largura: 100,
      altura: 25,
      conteudo: 'Paulo',
      fonte: 'helvetica',
      negrito: false,
      italico: false,
      tamanho: 20,
      cor: '#000000',
    })

    it.each([
      ['direita', 1, 21],
      ['baixo', 10, 30],
      ['esquerda', 1, 19],
      ['cima', 10, 10],
    ] as const)('%s %i dá fonte %i', (direcao: Direcao, passo, tamanho) => {
      const novo = redimensionarObjeto(texto, direcao, passo, pagina)
      expect(novo.tamanho).toBe(tamanho)
      expect(novo.largura).toBeCloseTo((100 * tamanho) / 20)
      expect(novo.altura).toBeCloseTo((25 * tamanho) / 20)
    })

    it('não passa do mínimo nem do máximo da fonte', () => {
      expect(
        redimensionarObjeto({ ...texto, tamanho: 5 }, 'cima', 10, pagina)
          .tamanho,
      ).toBe(TAMANHO_MINIMO_DO_TEXTO)
      const minimo = { ...texto, tamanho: TAMANHO_MINIMO_DO_TEXTO }
      expect(redimensionarObjeto(minimo, 'cima', 1, pagina)).toBe(minimo)
      const grande = { largura: 100_000, altura: 100_000 }
      expect(
        redimensionarObjeto({ ...texto, tamanho: 295 }, 'direita', 10, grande)
          .tamanho,
      ).toBe(TAMANHO_MAXIMO_DO_TEXTO)
    })

    it('cresce só até a caixa encostar na borda da página', () => {
      // (200 - 10) / 100 = 1,9 vezes: a fonte vai no máximo a 38.
      const quase = comTamanhoDeFonte(texto, 30)
      expect(
        redimensionarObjeto(quase, 'direita', 10, pagina).tamanho,
      ).toBeCloseTo(38)
      const naBorda = comTamanhoDeFonte(texto, 38)
      expect(redimensionarObjeto(naBorda, 'baixo', 1, pagina)).toBe(naBorda)
    })
  })

  it('limitarAPagina encolhe o que não cabe e traz para dentro', () => {
    expect(
      limitarAPagina({ ...retangulo, x: -20, largura: 300 }, pagina),
    ).toMatchObject({
      x: 0,
      largura: 200,
      altura: 20,
    })
    expect(limitarAPagina({ ...retangulo, y: 95 }, pagina).y).toBe(80)
    expect(limitarAPagina(retangulo, pagina)).toBe(retangulo)
    const textoGrande: ObjetoTexto = {
      id: 't',
      tipo: 'texto',
      x: 50,
      y: 0,
      largura: 400,
      altura: 50,
      conteudo: 'Grande',
      fonte: 'times',
      negrito: true,
      italico: false,
      tamanho: 40,
      cor: '#000000',
    }
    expect(limitarAPagina(textoGrande, pagina)).toMatchObject({
      x: 0,
      tamanho: 20,
      largura: 200,
      altura: 25,
    })
  })
})

describe('desfazer e refazer', () => {
  it('começa sem nada para desfazer nem refazer', () => {
    const historico = historicoInicial('a')
    expect(podeDesfazer(historico)).toBe(false)
    expect(podeRefazer(historico)).toBe(false)
    expect(desfazer(historico)).toBe(historico)
    expect(refazer(historico)).toBe(historico)
  })

  it('desfaz e refaz na ordem', () => {
    let historico = historicoInicial('a')
    historico = registrarNoHistorico(historico, 'b')
    historico = registrarNoHistorico(historico, 'c')
    historico = desfazer(historico)
    expect(historico.presente).toBe('b')
    historico = desfazer(historico)
    expect(historico.presente).toBe('a')
    expect(podeDesfazer(historico)).toBe(false)
    historico = refazer(historico)
    expect(historico.presente).toBe('b')
    historico = refazer(historico)
    expect(historico.presente).toBe('c')
    expect(podeRefazer(historico)).toBe(false)
  })

  it('uma ação nova depois de desfazer apaga o que dava para refazer', () => {
    let historico = registrarNoHistorico(historicoInicial('a'), 'b')
    historico = desfazer(historico)
    historico = registrarNoHistorico(historico, 'x')
    expect(historico).toEqual({ passado: ['a'], presente: 'x', futuro: [] })
  })

  it('o mesmo estado não vira um passo', () => {
    const estado = { objetos: [] }
    const historico = historicoInicial(estado)
    expect(registrarNoHistorico(historico, estado)).toBe(historico)
  })

  it('guarda no máximo o limite de passos, descartando os mais antigos', () => {
    expect(LIMITE_DO_HISTORICO).toBe(100)
    let historico = historicoInicial(0)
    for (let i = 1; i <= 5; i++)
      historico = registrarNoHistorico(historico, i, 3)
    expect(historico.passado).toEqual([2, 3, 4])
    for (let i = 1; i <= 150; i++)
      historico = registrarNoHistorico(historico, i)
    expect(historico.passado).toHaveLength(LIMITE_DO_HISTORICO)
    expect(() => registrarNoHistorico(historico, 1, 0)).toThrow(RangeError)
  })
})

describe('pixelsDoFundo (o canvas da página que vai ser apagada de verdade)', () => {
  it('desenha a 200 dpi', () => {
    expect(pixelsDoFundo({ largura: 595, altura: 842 })).toMatchObject({
      largura: 1652,
      altura: 2338,
    })
  })

  it('reduz até caber no limite de pixels do Safari', () => {
    const { largura, altura } = pixelsDoFundo({ largura: 2000, altura: 2000 })
    expect(largura * altura).toBeLessThanOrEqual(PIXELS_MAXIMOS_DO_CANVAS)
    expect(largura).toBeGreaterThan(4000)
  })

  it('reduz até o lado mais comprido caber no canvas', () => {
    const { largura, altura } = pixelsDoFundo({ largura: 14_400, altura: 100 })
    expect(largura).toBeLessThanOrEqual(LADO_MAXIMO_DO_CANVAS)
    expect(altura).toBeGreaterThan(0)
  })
})

describe('limitarAoCanvas (a página grande da tela)', () => {
  it('cabendo, fica com a escala pedida', () => {
    expect(limitarAoCanvas({ largura: 595, altura: 842 }, 2)).toEqual({
      largura: 1190,
      altura: 1684,
      escala: 2,
    })
  })

  it('A4 com zoom alto numa tela de densidade 3: reduz até o limite de pixels do Safari no iOS, sem deformar', () => {
    const { largura, altura, escala } = limitarAoCanvas(
      { largura: 595, altura: 842 },
      10,
    )
    expect(largura * altura).toBeLessThanOrEqual(PIXELS_MAXIMOS_DO_CANVAS)
    expect(largura * altura).toBeGreaterThan(PIXELS_MAXIMOS_DO_CANVAS * 0.99)
    expect(escala).toBeLessThan(10)
    expect(largura / altura).toBeCloseTo(595 / 842, 3)
  })

  it('página estreita e comprida: reduz até o lado caber', () => {
    const { altura } = limitarAoCanvas({ largura: 50, altura: 14_400 }, 2)
    expect(altura).toBeLessThanOrEqual(LADO_MAXIMO_DO_CANVAS)
  })

  it('nunca dá canvas vazio', () => {
    expect(limitarAoCanvas({ largura: 0.1, altura: 0.1 }, 1)).toMatchObject({
      largura: 1,
      altura: 1,
    })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'recusa a escala %p',
    (escala) => {
      expect(() =>
        limitarAoCanvas({ largura: 595, altura: 842 }, escala),
      ).toThrow(RangeError)
    },
  )
})
