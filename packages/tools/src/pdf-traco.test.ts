import {
  tracoDosPontos,
  type ObjetoTraco,
  type PontoDoTraco,
} from './pdf-regras'
import {
  caixaDosTracos,
  caminhoDoTraco,
  caminhoSvgDoContorno,
  contornoDoTraco,
  type PontoDoContorno,
} from './pdf-traco'

const ZIGUEZAGUE: PontoDoTraco[] = [
  [10, 10],
  [20, 30],
  [30, 10],
  [40, 30],
  [50, 10],
]

function caixaDe(pontos: readonly (readonly number[])[]) {
  const xs = pontos.map((p) => p[0])
  const ys = pontos.map((p) => p[1])
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  }
}

// Os números do caminho, aos pares, na ordem em que aparecem.
function pontosDoCaminho(caminho: string): number[][] {
  const numeros = caminho.match(/-?\d+(\.\d+)?/g)!.map(Number)
  return Array.from({ length: numeros.length / 2 }, (_, i) =>
    numeros.slice(i * 2, i * 2 + 2),
  )
}

function umTraco(extra: Partial<ObjetoTraco> = {}): ObjetoTraco {
  return {
    id: 'd',
    tipo: 'traco',
    ...tracoDosPontos(ZIGUEZAGUE),
    espessura: 4,
    cor: '#000000',
    ...extra,
  }
}

describe('contornoDoTraco', () => {
  // O streamline do perfect-freehand arredonda os bicos do ziguezague: o contorno não chega até eles.
  it('envolve os pontos com a espessura pedida, suavizando o caminho', () => {
    const caixa = caixaDe(contornoDoTraco(ZIGUEZAGUE, 4))
    expect(caixa.x1).toBeGreaterThanOrEqual(10 - 4)
    expect(caixa.x1).toBeLessThan(10)
    expect(caixa.x2).toBeGreaterThan(50 - 4)
    expect(caixa.x2).toBeLessThanOrEqual(50 + 4)
    expect(caixa.y1).toBeLessThan(16)
    expect(caixa.y2).toBeGreaterThan(24)
  })

  it('um toque só vira um ponto redondo, não some', () => {
    expect(contornoDoTraco([[10, 10]], 6).length).toBeGreaterThan(3)
  })

  it('usa a pressão do ponteiro quando todos os pontos a trazem', () => {
    const leve = ZIGUEZAGUE.map(([x, y]) => [x, y, 0.1] as const)
    const forte = ZIGUEZAGUE.map(([x, y]) => [x, y, 1] as const)
    const altura = (contorno: PontoDoContorno[]) => {
      const caixa = caixaDe(contorno)
      return caixa.y2 - caixa.y1
    }
    expect(altura(contornoDoTraco(forte, 8))).toBeGreaterThan(
      altura(contornoDoTraco(leve, 8)),
    )
  })
})

describe('caminhoSvgDoContorno', () => {
  it('fecha o contorno com curvas Q de ponto médio a ponto médio', () => {
    const contorno: PontoDoContorno[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    expect(caminhoSvgDoContorno(contorno)).toBe(
      'M 5.00 0.00 Q 10.00 0.00 10.00 5.00 Q 10.00 10.00 5.00 10.00 Q 0.00 10.00 0.00 5.00 Q 0.00 0.00 5.00 0.00 Z',
    )
  })

  it('menos de 3 pontos não é um contorno', () => {
    expect(
      caminhoSvgDoContorno([
        [0, 0],
        [1, 1],
      ]),
    ).toBe('')
  })
})

describe('caminhoDoTraco', () => {
  it('desenha nas coordenadas da tela', () => {
    const caixa = caixaDe(pontosDoCaminho(caminhoDoTraco(umTraco())))
    expect(caixa.x1).toBeGreaterThanOrEqual(6)
    expect(caixa.x2).toBeLessThanOrEqual(54)
  })

  it('acompanha a caixa do objeto: mover desloca o caminho inteiro', () => {
    const antes = caixaDe(pontosDoCaminho(caminhoDoTraco(umTraco())))
    const depois = caixaDe(
      pontosDoCaminho(caminhoDoTraco(umTraco({ x: 110, y: 210 }))),
    )
    expect(depois.x1 - antes.x1).toBeCloseTo(100, 1)
    expect(depois.y1 - antes.y1).toBeCloseTo(200, 1)
  })
})

describe('caixaDosTracos (o recorte da assinatura desenhada)', () => {
  it('contém o contorno de cada traço, com a espessura', () => {
    const caixa = caixaDosTracos([ZIGUEZAGUE], 4)!
    const contorno = caixaDe(contornoDoTraco(ZIGUEZAGUE, 4))
    expect(caixa).toEqual({
      x: contorno.x1,
      y: contorno.y1,
      largura: contorno.x2 - contorno.x1,
      altura: contorno.y2 - contorno.y1,
    })
    expect(caixa.x).toBeLessThan(10)
    expect(caixa.x + caixa.largura).toBeGreaterThan(50 - 4)
  })

  it('junta todos os traços (o nome e o sobrenome, o pingo do i)', () => {
    const pingo: PontoDoTraco[] = [[300, 150]]
    const caixa = caixaDosTracos([ZIGUEZAGUE, pingo], 6)!
    expect(caixa.x).toBeLessThan(10)
    expect(caixa.y).toBeLessThan(10)
    expect(caixa.x + caixa.largura).toBeGreaterThan(300)
    expect(caixa.x + caixa.largura).toBeLessThanOrEqual(306)
    expect(caixa.y + caixa.altura).toBeGreaterThan(150)
  })

  it('aguenta um traço longo (sem passar do limite de argumentos de uma chamada)', () => {
    const longo: PontoDoTraco[] = Array.from({ length: 200_000 }, (_, i) => [
      i % 600,
      (i * 7) % 200,
    ])
    expect(caixaDosTracos([longo], 3)).not.toBeNull()
  })

  it('sem traço não há recorte', () => {
    expect(caixaDosTracos([], 4)).toBeNull()
    expect(caixaDosTracos([[]], 4)).toBeNull()
  })
})
