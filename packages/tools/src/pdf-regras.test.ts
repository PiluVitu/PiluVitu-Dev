import {
  NOME_PADRAO_DO_PDF_FINAL,
  TETO_DE_PAGINAS,
  TETO_TOTAL_EM_BYTES,
  apagar,
  cabemNoTeto,
  extrair,
  fracaoDaMesclagem,
  girar,
  moverSelecionadas,
  nomeDoPdfFinal,
  planoInicial,
  type PaginaDoPlano,
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

describe('TETO_DE_PAGINAS', () => {
  it('é de 500 páginas', () => {
    expect(TETO_DE_PAGINAS).toBe(500)
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
