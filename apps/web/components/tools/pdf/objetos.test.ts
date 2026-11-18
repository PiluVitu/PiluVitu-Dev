import {
  METRICAS_DAS_FONTES,
  TAMANHO_MAXIMO_DO_TEXTO,
  historicoInicial,
  registrarNoHistorico,
  type ObjetoTexto,
} from '@piluvitu/tools/pdf-regras'
import type { ObjetoNaTela } from './motor'
import {
  CENA_VAZIA,
  cenaDasPaginas,
  molduraDa,
  CORES,
  ESTILOS_PADRAO,
  FERRAMENTAS,
  caixaDoTexto,
  cobrirDa,
  comApagarDeVerdade,
  comMudanca,
  corDoNome,
  criarObjeto,
  criarTraco,
  imagensDa,
  incluirObjeto,
  lembrarEstilo,
  moverPara,
  nomeDaCor,
  objetosDa,
  paginasMudadas,
  paginasParaApagar,
  pontoDoEvento,
  redimensionarAte,
  temCobrir,
  tirarObjeto,
  totalDeObjetos,
  trocarObjeto,
  type MedirTexto,
} from './objetos'

const A4 = { largura: 595, altura: 842 }

// 10 px por caractere a 100 px: meio em por letra, fácil de conferir.
const medir: MedirTexto = (texto) => texto.length * 50

describe('as ferramentas', () => {
  it('são as dez do Editar, na ordem da barra, sem a Assinatura', () => {
    expect(FERRAMENTAS).toEqual([
      'selecionar',
      'texto',
      'imagem',
      'desenho',
      'retangulo',
      'elipse',
      'linha',
      'seta',
      'marca-texto',
      'cobrir',
    ])
    expect(FERRAMENTAS).not.toContain('assinatura')
  })
})

describe('caixaDoTexto', () => {
  it('a largura é a da linha mais comprida, e a altura vem das métricas da fonte', () => {
    const caixa = caixaDoTexto(
      {
        conteudo: 'ab\nabcd',
        fonte: 'helvetica',
        negrito: false,
        italico: false,
        tamanho: 20,
      },
      medir,
    )
    const { ascendente, descendente } = METRICAS_DAS_FONTES.helvetica
    expect(caixa.largura).toBeCloseTo(4 * 0.5 * 20)
    expect(caixa.altura).toBeCloseTo(20 * (1.2 + ascendente + descendente))
  })

  it('mede na fonte CSS da família, com negrito e itálico', () => {
    const fontes: string[] = []
    caixaDoTexto(
      {
        conteudo: 'x',
        fonte: 'times',
        negrito: true,
        italico: true,
        tamanho: 12,
      },
      (texto, fonte) => {
        fontes.push(fonte)
        return 10
      },
    )
    expect(fontes[0]).toMatch(/^italic bold 100px "Times New Roman"/)
  })

  it('sem medida do navegador, usa a largura média da família; vazio ainda tem caixa', () => {
    const semMedida: MedirTexto = () => null
    const courier = caixaDoTexto(
      {
        conteudo: 'abcd',
        fonte: 'courier',
        negrito: false,
        italico: false,
        tamanho: 10,
      },
      semMedida,
    )
    expect(courier.largura).toBeCloseTo(4 * 0.6 * 10)
    const vazio = caixaDoTexto(
      { ...ESTILOS_PADRAO.texto, conteudo: '' },
      semMedida,
    )
    expect(vazio.largura).toBeGreaterThan(0)
  })
})

describe('criarObjeto', () => {
  it('no centro: retângulo no tamanho padrão, centrado no ponto, com o estilo das formas', () => {
    const objeto = criarObjeto(
      'retangulo',
      { centro: { x: 300, y: 400 } },
      A4,
      ESTILOS_PADRAO,
      {},
      'r1',
    )
    expect(objeto).toEqual({
      id: 'r1',
      tipo: 'retangulo',
      x: 240,
      y: 360,
      largura: 120,
      altura: 80,
      cor: ESTILOS_PADRAO.forma.cor,
      espessura: ESTILOS_PADRAO.forma.espessura,
    })
  })

  it('por arraste: a caixa entre os dois pontos, em qualquer sentido', () => {
    const objeto = criarObjeto(
      'elipse',
      { de: { x: 200, y: 300 }, ate: { x: 100, y: 250 } },
      A4,
      ESTILOS_PADRAO,
    )
    expect(objeto).toMatchObject({ x: 100, y: 250, largura: 100, altura: 50 })
  })

  it('linha e seta guardam de onde o arraste começou', () => {
    const seta = criarObjeto(
      'seta',
      { de: { x: 200, y: 100 }, ate: { x: 100, y: 300 } },
      A4,
      ESTILOS_PADRAO,
    )
    expect(seta).toMatchObject({
      tipo: 'seta',
      x: 100,
      y: 100,
      largura: 100,
      altura: 200,
      inicio: 'superior-direito',
    })
  })

  it('cobrir não tem cor nem espessura; marca-texto tem a cor dele', () => {
    const cobrir = criarObjeto(
      'cobrir',
      { centro: { x: 300, y: 300 } },
      A4,
      ESTILOS_PADRAO,
    )
    expect(cobrir).not.toHaveProperty('cor')
    expect(cobrir).not.toHaveProperty('espessura')
    const marca = criarObjeto(
      'marca-texto',
      { centro: { x: 300, y: 300 } },
      A4,
      ESTILOS_PADRAO,
    )
    expect(marca).toMatchObject({ cor: CORES.amarelo })
    expect(marca).not.toHaveProperty('espessura')
  })

  it('o texto começa no ponto do arraste, com o conteúdo e o estilo do texto', () => {
    const texto = criarObjeto(
      'texto',
      { de: { x: 50, y: 60 }, ate: { x: 300, y: 300 } },
      A4,
      ESTILOS_PADRAO,
      { conteudo: 'Olá', medir },
    ) as ObjetoTexto
    expect(texto).toMatchObject({
      tipo: 'texto',
      x: 50,
      y: 60,
      conteudo: 'Olá',
      fonte: 'helvetica',
      tamanho: 16,
    })
    expect(texto.largura).toBeCloseTo(3 * 0.5 * 16)
  })

  it('imagem no centro: tamanho natural (pixel CSS em ponto), reduzida a 60% da página se for maior', () => {
    const pequena = criarObjeto(
      'imagem',
      { centro: { x: 297.5, y: 421 } },
      A4,
      ESTILOS_PADRAO,
      { imagem: { id: 'i', largura: 200, altura: 100 } },
    )
    expect(pequena).toMatchObject({
      tipo: 'imagem',
      imagem: 'i',
      largura: 150,
      altura: 75,
    })
    const grande = criarObjeto(
      'imagem',
      { centro: { x: 297.5, y: 421 } },
      A4,
      ESTILOS_PADRAO,
      { imagem: { id: 'i', largura: 2400, altura: 1200 } },
    )
    expect(grande.largura).toBeCloseTo(595 * 0.6)
    expect(grande.altura).toBeCloseTo((595 * 0.6) / 2)
  })

  it('imagem por arraste cabe na caixa e guarda a proporção; arraste reto vale pelo lado que andou', () => {
    const imagem = { id: 'i', largura: 400, altura: 200 }
    const naCaixa = criarObjeto(
      'imagem',
      { de: { x: 10, y: 10 }, ate: { x: 210, y: 310 } },
      A4,
      ESTILOS_PADRAO,
      { imagem },
    )
    expect(naCaixa).toMatchObject({ x: 10, y: 10, largura: 200, altura: 100 })
    const reta = criarObjeto(
      'imagem',
      { de: { x: 10, y: 10 }, ate: { x: 110, y: 10 } },
      A4,
      ESTILOS_PADRAO,
      { imagem },
    )
    expect(reta).toMatchObject({ largura: 100, altura: 50 })
  })

  it('imagem sem arquivo é erro de programação', () => {
    expect(() =>
      criarObjeto('imagem', { centro: { x: 1, y: 1 } }, A4, ESTILOS_PADRAO),
    ).toThrow(RangeError)
  })

  it('nunca nasce fora da página: no canto, o objeto encosta na borda', () => {
    const objeto = criarObjeto(
      'retangulo',
      { centro: { x: 590, y: 5 } },
      A4,
      ESTILOS_PADRAO,
    )
    expect(objeto).toMatchObject({ x: 595 - 120, y: 0 })
  })

  it('o desenho nasce dos pontos, em fração da caixa, com o estilo do desenho', () => {
    const traco = criarTraco(
      [
        [10, 20],
        [30, 60],
      ],
      ESTILOS_PADRAO.traco,
      't',
    )
    expect(traco).toEqual({
      id: 't',
      tipo: 'traco',
      x: 10,
      y: 20,
      largura: 20,
      altura: 40,
      pontos: [
        [0, 0],
        [1, 1],
      ],
      cor: ESTILOS_PADRAO.traco.cor,
      espessura: ESTILOS_PADRAO.traco.espessura,
    })
  })
})

const retangulo: ObjetoNaTela = {
  id: 'r',
  tipo: 'retangulo',
  x: 100,
  y: 100,
  largura: 100,
  altura: 50,
  cor: '#000000',
  espessura: 2,
}

const texto: ObjetoNaTela = {
  id: 't',
  tipo: 'texto',
  x: 100,
  y: 100,
  largura: 40,
  altura: 20,
  conteudo: 'oi',
  fonte: 'helvetica',
  negrito: false,
  italico: false,
  tamanho: 20,
  cor: '#000000',
}

describe('mover e redimensionar pelo ponteiro', () => {
  it('moverPara fica dentro da página', () => {
    expect(moverPara(retangulo, -50, 900, A4)).toMatchObject({
      x: 0,
      y: 842 - 50,
    })
  })

  it('a alça do canto puxa a largura e a altura até o ponto, sem passar da página', () => {
    expect(redimensionarAte(retangulo, { x: 250, y: 300 }, A4)).toMatchObject({
      x: 100,
      y: 100,
      largura: 150,
      altura: 200,
    })
    expect(redimensionarAte(retangulo, { x: 50, y: 50 }, A4)).toMatchObject({
      largura: 1,
      altura: 1,
    })
  })

  it('a imagem guarda a proporção, e o texto muda a letra', () => {
    const imagem: ObjetoNaTela = {
      id: 'i',
      tipo: 'imagem',
      imagem: 'a',
      x: 0,
      y: 0,
      largura: 200,
      altura: 100,
    }
    expect(redimensionarAte(imagem, { x: 400, y: 120 }, A4)).toMatchObject({
      largura: 400,
      altura: 200,
    })
    const maior = redimensionarAte(texto, { x: 180, y: 140 }, A4)
    expect(maior).toMatchObject({ tamanho: 40, largura: 80, altura: 40 })
  })

  it('o texto não passa do tamanho máximo nem da página', () => {
    const enorme = redimensionarAte(texto, { x: 595, y: 842 }, A4)
    expect(enorme.tamanho).toBeLessThanOrEqual(TAMANHO_MAXIMO_DO_TEXTO)
    expect(enorme.x + enorme.largura).toBeLessThanOrEqual(595 + 1e-9)
  })
})

describe('comMudanca (o painel)', () => {
  it('X e Y ficam dentro da página', () => {
    expect(
      comMudanca(retangulo, { campo: 'x', valor: 1000 }, A4),
    ).toMatchObject({ x: 595 - 100 })
    expect(comMudanca(retangulo, { campo: 'y', valor: -3 }, A4)).toMatchObject({
      y: 0,
    })
  })

  it('largura e altura param na borda da página, sem mover o objeto', () => {
    expect(
      comMudanca(retangulo, { campo: 'largura', valor: 900 }, A4),
    ).toMatchObject({ x: 100, largura: 495 })
    expect(
      comMudanca(retangulo, { campo: 'altura', valor: 0 }, A4),
    ).toMatchObject({ altura: 1 })
  })

  it('o texto não tem largura e altura no painel: muda pela letra e pelo conteúdo', () => {
    expect(comMudanca(texto, { campo: 'largura', valor: 500 }, A4)).toBe(texto)
    expect(
      comMudanca(texto, { campo: 'tamanho', valor: 10 }, A4),
    ).toMatchObject({ tamanho: 10, largura: 20, altura: 10 })
    const novo = comMudanca(
      texto,
      { campo: 'conteudo', valor: 'abcdef' },
      A4,
      medir,
    )
    expect(novo).toMatchObject({ conteudo: 'abcdef', largura: 6 * 0.5 * 20 })
    expect(
      comMudanca(texto, { campo: 'negrito', valor: true }, A4, medir),
    ).toMatchObject({ negrito: true })
  })

  it('cor só no formato #rrggbb; espessura entre 0,5 e 50', () => {
    expect(
      comMudanca(retangulo, { campo: 'cor', valor: '#ABCDEF' }, A4),
    ).toMatchObject({ cor: '#abcdef' })
    expect(comMudanca(retangulo, { campo: 'cor', valor: 'red' }, A4)).toBe(
      retangulo,
    )
    expect(
      comMudanca(retangulo, { campo: 'espessura', valor: 0 }, A4),
    ).toMatchObject({ espessura: 0.5 })
    expect(
      comMudanca(retangulo, { campo: 'espessura', valor: 99 }, A4),
    ).toMatchObject({ espessura: 50 })
  })

  it('cobrir não ganha cor nem espessura', () => {
    const cobrir: ObjetoNaTela = {
      id: 'c',
      tipo: 'cobrir',
      x: 0,
      y: 0,
      largura: 5,
      altura: 5,
    }
    expect(comMudanca(cobrir, { campo: 'cor', valor: '#ff0000' }, A4)).toBe(
      cobrir,
    )
    expect(comMudanca(cobrir, { campo: 'espessura', valor: 3 }, A4)).toBe(
      cobrir,
    )
  })
})

describe('estilo dos objetos novos', () => {
  it('segue o último que a pessoa escolheu, por grupo', () => {
    const estilos = lembrarEstilo(ESTILOS_PADRAO, {
      ...retangulo,
      cor: '#16a34a',
      espessura: 5,
    })
    expect(estilos.forma).toEqual({ cor: '#16a34a', espessura: 5 })
    expect(estilos.traco).toBe(ESTILOS_PADRAO.traco)
    expect(
      lembrarEstilo(estilos, { ...texto, tamanho: 30 }).texto.tamanho,
    ).toBe(30)
  })

  it('o nome da cor da lista, ou nada quando é outra', () => {
    expect(nomeDaCor('#DC2626')).toBe('vermelho')
    expect(nomeDaCor('#123456')).toBeNull()
  })

  it('a cor de um nome só vem da lista: nome do protótipo não vira cor', () => {
    expect(corDoNome('azul')).toBe(CORES.azul)
    expect(corDoNome('constructor')).toBeNull()
    expect(corDoNome('__proto__')).toBeNull()
    expect(corDoNome('outra')).toBeNull()
  })
})

describe('a cena (os objetos de cada página, pelo id da página)', () => {
  it('incluir, trocar e tirar devolvem cenas novas, e a página sem objeto sai do mapa', () => {
    const uma = incluirObjeto(CENA_VAZIA, 'a0p2', retangulo)
    expect(objetosDa(uma, 'a0p2')).toEqual([retangulo])
    expect(objetosDa(CENA_VAZIA, 'a0p2')).toEqual([])
    const movido = { ...retangulo, x: 5 }
    const duas = trocarObjeto(uma, 'a0p2', movido)
    expect(objetosDa(duas, 'a0p2')).toEqual([movido])
    expect(trocarObjeto(duas, 'a0p2', movido)).toBe(duas)
    expect(trocarObjeto(duas, 'a0p0', movido)).toBe(duas)
    const vazia = tirarObjeto(duas, 'a0p2', 'r')
    expect(vazia.objetos.has('a0p2')).toBe(false)
    expect(tirarObjeto(vazia, 'a0p2', 'r')).toBe(vazia)
  })

  it('a página de outro arquivo com o mesmo índice é outra página', () => {
    const cena = incluirObjeto(CENA_VAZIA, 'a1p0', retangulo)
    expect(objetosDa(cena, 'a0p0')).toEqual([])
    expect(objetosDa(cena, 'a1p0')).toEqual([retangulo])
  })

  it('páginas para apagar de verdade: só as marcadas que têm cobrir, na ordem do documento', () => {
    const cobrir: ObjetoNaTela = {
      id: 'c',
      tipo: 'cobrir',
      x: 1,
      y: 2,
      largura: 3,
      altura: 4,
    }
    let cena = incluirObjeto(CENA_VAZIA, 'a0p1', cobrir)
    cena = incluirObjeto(cena, 'a0p1', retangulo)
    cena = incluirObjeto(cena, 'a0p4', cobrir)
    cena = comApagarDeVerdade(cena, 'a0p4', true)
    cena = comApagarDeVerdade(cena, 'a0p1', true)
    cena = comApagarDeVerdade(cena, 'a0p3', true)
    expect(comApagarDeVerdade(cena, 'a0p3', true)).toBe(cena)
    expect(temCobrir(cena, 'a0p1')).toBe(true)
    expect(paginasParaApagar(cena, ['a0p0', 'a0p1', 'a0p3', 'a0p4'])).toEqual([
      'a0p1',
      'a0p4',
    ])
    expect(paginasParaApagar(cena, ['a0p4', 'a0p3', 'a0p1'])).toEqual([
      'a0p4',
      'a0p1',
    ])
    expect(cobrirDa(cena, 'a0p1')).toEqual([
      { x: 1, y: 2, largura: 3, altura: 4 },
    ])
    expect(totalDeObjetos(cena)).toBe(3)
  })

  it('as imagens usadas e as páginas que mudaram entre duas cenas, na ordem do documento', () => {
    const imagem: ObjetoNaTela = {
      id: 'i',
      tipo: 'imagem',
      imagem: 'foto',
      x: 0,
      y: 0,
      largura: 1,
      altura: 1,
    }
    const antes = incluirObjeto(CENA_VAZIA, 'a0p0', retangulo)
    const depois = comApagarDeVerdade(
      incluirObjeto(antes, 'a0p4', imagem),
      'a0p2',
      true,
    )
    expect([...imagensDa(depois)]).toEqual(['foto'])
    expect(
      paginasMudadas(antes, depois, ['a0p0', 'a0p1', 'a0p2', 'a0p3', 'a0p4']),
    ).toEqual(['a0p2', 'a0p4'])
    expect(paginasMudadas(antes, depois, ['a0p4', 'a0p2', 'a0p0'])).toEqual([
      'a0p4',
      'a0p2',
    ])
    expect(paginasMudadas(depois, depois, ['a0p0'])).toEqual([])
  })

  it('a página que mudou e não está na ordem vem depois das que estão', () => {
    const depois = incluirObjeto(
      incluirObjeto(CENA_VAZIA, 'a0p7', retangulo),
      'a0p1',
      retangulo,
    )
    expect(paginasMudadas(CENA_VAZIA, depois, ['a0p1'])).toEqual([
      'a0p1',
      'a0p7',
    ])
  })

  it('a moldura: o giro da página quando o primeiro objeto entrou; sem objetos, é o giro de agora', () => {
    expect(molduraDa(CENA_VAZIA, 'a0p0', 90)).toBe(90)
    const uma = incluirObjeto(CENA_VAZIA, 'a0p0', retangulo, 90)
    expect(uma.molduras.get('a0p0')).toBe(90)
    expect(molduraDa(uma, 'a0p0', 180)).toBe(90)
    const duas = incluirObjeto(uma, 'a0p0', { ...retangulo, id: 's' }, 180)
    expect(molduraDa(duas, 'a0p0', 180)).toBe(90)
    const umaSo = tirarObjeto(duas, 'a0p0', 's')
    expect(molduraDa(umaSo, 'a0p0', 180)).toBe(90)
    const vazia = tirarObjeto(umaSo, 'a0p0', 'r')
    expect(vazia.molduras.has('a0p0')).toBe(false)
    expect(molduraDa(vazia, 'a0p0', 180)).toBe(180)
    expect(
      incluirObjeto(CENA_VAZIA, 'a0p1', retangulo).molduras.get('a0p1'),
    ).toBe(0)
  })

  it('a cena só das páginas pedidas (o Worker recusa objeto de página que não está no pedido)', () => {
    const cobrir: ObjetoNaTela = {
      id: 'c',
      tipo: 'cobrir',
      x: 1,
      y: 2,
      largura: 3,
      altura: 4,
    }
    let cena = incluirObjeto(CENA_VAZIA, 'a0p0', retangulo, 90)
    cena = incluirObjeto(cena, 'a0p2', cobrir)
    cena = comApagarDeVerdade(cena, 'a0p2', true)
    cena = comApagarDeVerdade(cena, 'a0p0', true)

    const so = cenaDasPaginas(cena, new Set(['a0p2', 'a0p5']))

    expect([...so.objetos.keys()]).toEqual(['a0p2'])
    expect([...so.apagar]).toEqual(['a0p2'])
    expect([...so.molduras.keys()]).toEqual(['a0p2'])
  })

  it('a cena vive no histórico do pdf-regras como qualquer valor', () => {
    const historico = registrarNoHistorico(
      historicoInicial(CENA_VAZIA),
      incluirObjeto(CENA_VAZIA, 'a0p0', retangulo),
    )
    expect(historico.passado).toEqual([CENA_VAZIA])
  })
})

describe('pontoDoEvento (o ponteiro na área da página)', () => {
  const caixa = { left: 100, top: 50, width: 300, height: 100 }
  const quadro = { largura: 600, altura: 200 }

  it('leva o ponto da tela para as unidades da área, sem sair dela', () => {
    expect(
      pontoDoEvento({ clientX: 250, clientY: 100 }, caixa, quadro),
    ).toEqual([300, 100])
    expect(pontoDoEvento({ clientX: 0, clientY: 900 }, caixa, quadro)).toEqual([
      0, 200,
    ])
  })

  it('só a caneta leva a pressão; mouse e dedo mandam valor fixo', () => {
    const evento = { clientX: 100, clientY: 50, pressure: 0.7 }
    expect(
      pontoDoEvento({ ...evento, pointerType: 'pen' }, caixa, quadro),
    ).toEqual([0, 0, 0.7])
    expect(
      pontoDoEvento({ ...evento, pointerType: 'mouse' }, caixa, quadro),
    ).toEqual([0, 0])
    expect(
      pontoDoEvento({ ...evento, pointerType: 'touch' }, caixa, quadro),
    ).toEqual([0, 0])
  })

  it('área sem medida dá a origem', () => {
    expect(pontoDoEvento({ clientX: 10, clientY: 10 }, null, quadro)).toEqual([
      0, 0,
    ])
    expect(
      pontoDoEvento(
        { clientX: 10, clientY: 10 },
        { ...caixa, width: 0 },
        quadro,
      ),
    ).toEqual([0, 0])
  })
})
