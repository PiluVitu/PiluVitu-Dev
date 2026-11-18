import {
  LADO_MAXIMO_DA_PAGINA,
  TAMANHO_A4,
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  type Giro,
  type Tamanho,
} from '@piluvitu/tools/pdf-regras'
import {
  apagarPaginas,
  desfazerPaginas,
  marcar,
  montagemDaBancada,
  mudarPaginas,
  paginasIniciais,
  type PaginaDaBancada,
  type PaginasComDesfazer,
} from './bancada'
import {
  abrirArquivo,
  adicionarBranca,
  adicionarPaginas,
  apagadasForaDoPdf,
  arquivosAlcancaveis,
  brancasAlcancaveis,
  cabeNoEditor,
  comArquivo,
  doArquivo,
  documentoInicial,
  nomeDoPdfBaixado,
  ocupacaoDe,
  paginasDoArquivo,
  pedidoDeArquivos,
  semInalcancaveis,
  tamanhoDaNovaBranca,
  type ArquivoDoEditor,
  type DocumentoDoEditor,
} from './documento-do-editor'
import type { ObjetoNaTela, PaginaParaMontar } from './motor'
import { criarMotorFalso } from './motor-falso'
import {
  CENA_VAZIA,
  comApagarDeVerdade,
  incluirObjeto,
  type Cena,
} from './objetos'
import type { DocumentoAberto } from './renderizador'
import { criarRenderizadorFalso } from './renderizador-falso'

// O renderizador de verdade cria o Worker do pdf.js com import.meta; aqui só o falso abre.
jest.mock('./novo-worker-pdfjs', () => ({ novoWorkerDoPdfjs: jest.fn() }))

const ids = (lista: readonly PaginaDaBancada[]) => lista.map(({ id }) => id)

function pdfDe(nome: string, bytes = 1_000): File {
  const arquivo = new File(['%PDF-1.7'], nome, { type: 'application/pdf' })
  Object.defineProperty(arquivo, 'size', { value: bytes })
  return arquivo
}

// O tamanho de cada página como o pdf.js a mostra (com o /Rotate dela); sem dizer, 600 × 800.
function abertoFalso(
  paginas: number,
  tamanhos: Record<number, Tamanho> = {},
): DocumentoAberto & { fechado: boolean } {
  const aberto = {
    paginas,
    fechado: false,
    miniatura: jest.fn(),
    pagina: jest.fn(),
    fundo: jest.fn(),
    textoNoPonto: jest.fn(),
    tamanho: jest.fn(
      async (indice: number) =>
        tamanhos[indice] ?? { largura: 600, altura: 800 },
    ),
    fechar: jest.fn(() => {
      aberto.fechado = true
    }),
  }
  return aberto
}

function arquivoDoEditor(
  nome: string,
  paginas: number,
  bytes = 1_000,
  tamanhos?: Record<number, Tamanho>,
): ArquivoDoEditor {
  return {
    arquivo: pdfDe(nome, bytes),
    paginas,
    avisos: [],
    aberto: abertoFalso(paginas, tamanhos),
  }
}

describe('o documento do editor: os arquivos da sessão', () => {
  it('o primeiro arquivo é o 0, e cada adicionado entra na posição seguinte da sessão', () => {
    const inicial = documentoInicial(arquivoDoEditor('a.pdf', 3))

    const { documento, arquivo } = comArquivo(
      inicial,
      arquivoDoEditor('b.pdf', 2),
    )

    expect(arquivo).toBe(1)
    expect(documento.sessao).toBe(inicial.sessao)
    expect(documento.arquivos.map((a) => a?.arquivo.name)).toEqual([
      'a.pdf',
      'b.pdf',
    ])
  })

  it('a origem da página leva ao documento do pdf.js do arquivo dela e ao índice nele', () => {
    const b = arquivoDoEditor('b.pdf', 2)
    const { documento } = comArquivo(
      documentoInicial(arquivoDoEditor('a.pdf', 3)),
      b,
    )

    expect(doArquivo(documento, { arquivo: 1, indice: 1 })).toEqual({
      aberto: b.aberto,
      indice: 1,
    })
    expect(() => doArquivo(documento, { arquivo: 2, indice: 0 })).toThrow(
      RangeError,
    )
    expect(() => doArquivo(documento, { arquivo: 1, indice: 2 })).toThrow(
      RangeError,
    )
  })

  it('as páginas de um arquivo ganham os ids dele, na ordem do arquivo', () => {
    expect(paginasDoArquivo(1, 3)).toEqual([
      { id: 'a1p0', origem: { arquivo: 1, indice: 0 }, giro: 0 },
      { id: 'a1p1', origem: { arquivo: 1, indice: 1 }, giro: 0 },
      { id: 'a1p2', origem: { arquivo: 1, indice: 2 }, giro: 0 },
    ])
  })
})

describe('adicionar as páginas de outro PDF (P3, D3, D4)', () => {
  it('sem marcada, entram no fim, e viram a seleção', () => {
    const { paginas, posicao } = adicionarPaginas(
      paginasIniciais(3),
      paginasDoArquivo(1, 2),
    )

    expect(posicao).toBe(3)
    expect(ids(paginas.lista)).toEqual(['a0p0', 'a0p1', 'a0p2', 'a1p0', 'a1p1'])
    expect(paginas.marcadas).toEqual(['a1p0', 'a1p1'])
  })

  it('entram logo depois da última página marcada, na ordem em que foi marcada, não na do documento (D4)', () => {
    let antes = paginasIniciais(5)
    antes = marcar(antes, 'a0p3', true)
    antes = marcar(antes, 'a0p1', true)

    const { paginas, posicao } = adicionarPaginas(antes, paginasDoArquivo(1, 2))

    expect(posicao).toBe(2)
    expect(ids(paginas.lista)).toEqual([
      'a0p0',
      'a0p1',
      'a1p0',
      'a1p1',
      'a0p2',
      'a0p3',
      'a0p4',
    ])
  })

  it('a última marcada que foi apagada não vale: entra depois da marcada anterior', () => {
    let antes = paginasIniciais(4)
    antes = marcar(antes, 'a0p0', true)
    antes = marcar(antes, 'a0p2', true)
    // Apagar tira a apagada da seleção; aqui a lista perde a0p2 e a seleção ainda a cita, como a de um passo antigo.
    antes = {
      ...antes,
      lista: antes.lista.filter(({ id }) => id !== 'a0p2'),
    }

    const { posicao } = adicionarPaginas(antes, paginasDoArquivo(1, 1))

    expect(posicao).toBe(1)
  })

  it('duas adições seguidas: a segunda entra depois das páginas da primeira (D3)', () => {
    let paginas = marcar(paginasIniciais(3), 'a0p0', true)
    paginas = adicionarPaginas(paginas, paginasDoArquivo(1, 2)).paginas

    const segunda = adicionarPaginas(paginas, paginasDoArquivo(2, 1))

    expect(ids(segunda.paginas.lista)).toEqual([
      'a0p0',
      'a1p0',
      'a1p1',
      'a2p0',
      'a0p1',
      'a0p2',
    ])
    expect(segunda.paginas.marcadas).toEqual(['a2p0'])
  })

  it('é um passo do desfazer das páginas: desfazer tira as adicionadas e devolve a seleção de antes', () => {
    const antes = marcar(paginasIniciais(2), 'a0p1', true)

    const { paginas } = adicionarPaginas(antes, paginasDoArquivo(1, 2))
    const desfeito = desfazerPaginas(paginas)

    expect(ids(desfeito.lista)).toEqual(['a0p0', 'a0p1'])
    expect(desfeito.marcadas).toEqual(['a0p1'])
  })
})

describe('os tetos somados (50 MB e 500 páginas, cabeNoDocumento)', () => {
  it('a ocupação soma os bytes e as páginas dos arquivos abertos', () => {
    const { documento } = comArquivo(
      documentoInicial(arquivoDoEditor('a.pdf', 300, 20_000_000)),
      arquivoDoEditor('b.pdf', 150, 10_000_000),
    )

    expect(ocupacaoDe(documento)).toEqual({
      bytes: 30_000_000,
      paginas: 450,
    })
  })

  it('o arquivo novo que passa dos bytes somados é recusado antes de ler, com o que ainda cabe', () => {
    const documento = documentoInicial(arquivoDoEditor('a.pdf', 10, 40_000_000))

    expect(cabeNoEditor(documento, { bytes: 10_000_001 })).toEqual({
      cabe: false,
      passou: 'bytes',
      restam: { bytes: 10_000_000, paginas: TETO_DE_PAGINAS - 10 },
    })
    expect(cabeNoEditor(documento, { bytes: 10_000_000 }).cabe).toBe(true)
  })

  it('o arquivo novo que passa das páginas somadas é recusado depois da contagem do pdf-lib', () => {
    const documento = documentoInicial(arquivoDoEditor('a.pdf', 450))

    expect(cabeNoEditor(documento, { bytes: 1, paginas: 51 })).toEqual({
      cabe: false,
      passou: 'paginas',
      restam: { bytes: TETO_DE_BYTES_COM_MINIATURAS - 1_000, paginas: 50 },
    })
    expect(cabeNoEditor(documento, { bytes: 1, paginas: 50 }).cabe).toBe(true)
  })

  it('o arquivo fechado sai da conta', () => {
    const { documento } = comArquivo(
      documentoInicial(arquivoDoEditor('a.pdf', 10, 10_000_000)),
      arquivoDoEditor('b.pdf', 490, 39_000_000),
    )

    const { documento: semB } = semInalcancaveis(documento, new Set([0]))

    expect(ocupacaoDe(semB)).toEqual({ bytes: 10_000_000, paginas: 10 })
  })
})

describe('fechar o arquivo que nenhuma página alcança', () => {
  it('alcança quem está na lista ou em algum passo do desfazer das páginas', () => {
    let paginas = adicionarPaginas(
      paginasIniciais(2),
      paginasDoArquivo(1, 1),
    ).paginas
    paginas = mudarPaginas(paginas, apagarPaginas(paginas, [2]))

    expect(arquivosAlcancaveis(paginas)).toEqual(new Set([0, 1]))
    expect(
      arquivosAlcancaveis(desfazerPaginas(desfazerPaginas(paginas))),
    ).toEqual(new Set([0]))
  })

  it('fecha o documento do pdf.js do arquivo inalcançável e deixa o buraco: os ids dos outros não mudam', () => {
    const b = arquivoDoEditor('b.pdf', 2)
    const c = arquivoDoEditor('c.pdf', 1)
    let documento = comArquivo(
      documentoInicial(arquivoDoEditor('a.pdf', 3)),
      b,
    ).documento
    documento = comArquivo(documento, c).documento

    const { documento: depois, fechados } = semInalcancaveis(
      documento,
      new Set([0, 2]),
    )

    expect(fechados).toEqual([b])
    expect(b.aberto.fechar).toHaveBeenCalledTimes(1)
    expect(c.aberto.fechar).not.toHaveBeenCalled()
    expect(depois.arquivos.map((a) => a?.arquivo.name ?? null)).toEqual([
      'a.pdf',
      null,
      'c.pdf',
    ])
    expect(doArquivo(depois, { arquivo: 2, indice: 0 }).aberto).toBe(c.aberto)
    expect(comArquivo(depois, arquivoDoEditor('d.pdf', 1)).arquivo).toBe(3)
  })

  it('com todos alcançáveis, o documento é o mesmo objeto (a tela não renderiza de novo)', () => {
    const documento = documentoInicial(arquivoDoEditor('a.pdf', 3))

    expect(semInalcancaveis(documento, new Set([0]))).toEqual({
      documento,
      fechados: [],
    })
  })
})

describe('o pedido ao motor: os arquivos que o plano usa', () => {
  const pagina = (arquivo: number, indice: number): PaginaParaMontar => ({
    id: `a${arquivo}p${indice}`,
    origem: { arquivo, indice },
    giro: 0,
    moldura: 0,
  })

  it('manda só os arquivos usados, renumerados na ordem da sessão, sem mudar os ids', () => {
    const a = arquivoDoEditor('a.pdf', 2)
    const c = arquivoDoEditor('c.pdf', 2)
    let documento = documentoInicial(a)
    documento = comArquivo(documento, arquivoDoEditor('b.pdf', 1)).documento
    documento = comArquivo(documento, c).documento

    const pedido = pedidoDeArquivos(documento, [
      pagina(2, 1),
      pagina(0, 0),
      pagina(2, 0),
    ])

    expect(pedido.arquivos).toEqual([a.arquivo, c.arquivo])
    expect(pedido.paginas).toEqual([
      { ...pagina(2, 1), origem: { arquivo: 1, indice: 1 } },
      pagina(0, 0),
      { ...pagina(2, 0), origem: { arquivo: 1, indice: 0 } },
    ])
    expect(pedido.porCopia).toBe(false)
  })

  // Sem o primeiro, o renumerado viraria o arquivo 0 e poderia sair no lugar, levando o que a tela avisou
  // que não leva.
  it('sem nenhuma página do primeiro arquivo, sai sempre por cópia', () => {
    const { documento } = comArquivo(
      documentoInicial(arquivoDoEditor('a.pdf', 2)),
      arquivoDoEditor('b.pdf', 2),
    )

    const pedido = pedidoDeArquivos(documento, [pagina(1, 0), pagina(1, 1)])

    expect(pedido.paginas.map(({ origem }) => origem)).toEqual([
      { arquivo: 0, indice: 0 },
      { arquivo: 0, indice: 1 },
    ])
    expect(pedido.porCopia).toBe(true)
  })
})

// Decisão do Paulo em 2026-11-18: o /Kids pode repetir a mesma página do arquivo em duas posições, e a
// tela não sabe. A página com apagar de verdade que não vai no PDF vai ao motor mesmo assim, se o arquivo
// dela vai: o montarDocumento apaga o nó dela, e a outra posição sai sem o que foi coberto.
describe('as apagadas de verdade que ficam fora do PDF', () => {
  const pagina = (arquivo: number, indice: number): PaginaDaBancada => ({
    id: `a${arquivo}p${indice}`,
    origem: { arquivo, indice },
    giro: 0,
  })
  const cobrir = (id: string): ObjetoNaTela => ({
    id,
    tipo: 'cobrir',
    x: 10,
    y: 10,
    largura: 50,
    altura: 20,
  })
  // O cobrir, com a moldura da página quando ele entrou, e o apagar de verdade ligado.
  const comApagada = (cena: Cena, id: string, moldura: Giro = 0): Cena =>
    comApagarDeVerdade(
      incluirObjeto(cena, id, cobrir(`cobrir-${id}`), moldura),
      id,
      true,
    )
  const fora = (
    arquivo: number,
    indice: number,
    noPedido = arquivo,
    moldura: Giro = 0,
  ) => ({
    id: `a${arquivo}p${indice}`,
    origem: { arquivo, indice },
    noPedido: { arquivo: noPedido, indice },
    moldura,
  })

  it('o Extrair só da outra página leva a apagada que ficou de fora, com a moldura dela', () => {
    const cena = comApagada(CENA_VAZIA, 'a0p0', 90)

    expect(apagadasForaDoPdf(cena, [pagina(0, 2)])).toEqual([fora(0, 0, 0, 90)])
  })

  it('a apagada tirada da Bancada também vai: a cena guarda os objetos dela', () => {
    const cena = comApagada(CENA_VAZIA, 'a0p0')
    const { lista } = apagarPaginas(
      { lista: paginasIniciais(3).lista, marcadas: [] },
      [0],
    )

    expect(ids(lista)).toEqual(['a0p1', 'a0p2'])
    expect(apagadasForaDoPdf(cena, lista)).toEqual([fora(0, 0)])
  })

  it('a apagada que está no PDF não vai como fora: vai como edição da página dela', () => {
    const cena = comApagada(comApagada(CENA_VAZIA, 'a0p0'), 'a0p1')

    expect(apagadasForaDoPdf(cena, [pagina(0, 0), pagina(0, 2)])).toEqual([
      fora(0, 1),
    ])
  })

  it('com o apagar de verdade desligado, ou ligado sem cobrir, a página não vira imagem e não vai', () => {
    const soCobrir = incluirObjeto(CENA_VAZIA, 'a0p0', cobrir('c1'))
    const semCobrir = comApagarDeVerdade(CENA_VAZIA, 'a0p1', true)

    expect(apagadasForaDoPdf(soCobrir, [pagina(0, 2)])).toEqual([])
    expect(apagadasForaDoPdf(semCobrir, [pagina(0, 2)])).toEqual([])
  })

  it('a apagada de um arquivo que não está no PDF não vai', () => {
    const cena = comApagada(CENA_VAZIA, 'a1p0')

    expect(apagadasForaDoPdf(cena, [pagina(0, 0), pagina(2, 1)])).toEqual([])
  })

  it('a página em branco nunca vai: não tem arquivo nem nó para proteger', () => {
    const cena = comApagada(CENA_VAZIA, 'b0')

    expect(apagadasForaDoPdf(cena, [pagina(0, 0)])).toEqual([])
  })

  it('o arquivo vai renumerado como no pedidoDeArquivos, também com o primeiro arquivo fora do PDF', () => {
    let documento = documentoInicial(arquivoDoEditor('a.pdf', 2))
    documento = comArquivo(documento, arquivoDoEditor('b.pdf', 2)).documento
    documento = comArquivo(documento, arquivoDoEditor('c.pdf', 2)).documento
    const cena = comApagada(comApagada(CENA_VAZIA, 'a2p0'), 'a1p1')

    const soDoTerceiro = [pagina(2, 1)]
    expect(apagadasForaDoPdf(cena, soDoTerceiro)).toEqual([fora(2, 0, 0)])
    expect(
      pedidoDeArquivos(documento, montagemDaBancada(soDoTerceiro, cena))
        .paginas[0].origem,
    ).toEqual({ arquivo: 0, indice: 1 })

    const doSegundoEDoTerceiro = [pagina(1, 0), pagina(2, 1)]
    expect(apagadasForaDoPdf(cena, doSegundoEDoTerceiro)).toEqual([
      fora(1, 1, 0),
      fora(2, 0, 1),
    ])
  })
})

describe('abrir um arquivo: o pdf-lib lê primeiro, o pdf.js abre depois', () => {
  const ferramentas = () => ({
    motor: criarMotorFalso(),
    renderizador: criarRenderizadorFalso(),
  })

  it('abre e guarda a contagem e os avisos do próprio arquivo (#124)', async () => {
    const { motor, renderizador } = ferramentas()

    const aberto = await abrirArquivo(
      pdfDe('contrato-assinado-3p.pdf'),
      { motor, renderizador },
      () => null,
    )

    expect(motor.analisadas).toEqual(['contrato-assinado-3p.pdf'])
    expect(renderizador.abertos).toEqual(['contrato-assinado-3p.pdf'])
    expect(aberto).toMatchObject({
      ok: true,
      arquivo: { paginas: 3, avisos: ['assinatura_digital'] },
    })
  })

  it('o que o pdf-lib recusa nem chega ao pdf.js', async () => {
    const { motor, renderizador } = ferramentas()

    for (const nome of ['extrato-senha.pdf', 'quebrado.pdf', 'foto.png']) {
      await expect(
        abrirArquivo(pdfDe(nome), { motor, renderizador }, () => null),
      ).resolves.toMatchObject({ ok: false })
    }

    expect(renderizador.abertos).toEqual([])
  })

  it('o teto conferido com a contagem do pdf-lib recusa antes do pdf.js', async () => {
    const { motor, renderizador } = ferramentas()

    const aberto = await abrirArquivo(
      pdfDe('livro-80p.pdf'),
      { motor, renderizador },
      (paginas) => (paginas > 50 ? { paginasDemais: paginas } : null),
    )

    expect(aberto).toEqual({ ok: false, recusa: { paginasDemais: 80 } })
    expect(renderizador.abertos).toEqual([])
  })

  // O PDF salvo teria outra página no lugar da que a pessoa viu.
  it('pdf-lib e pdf.js contando páginas diferentes: recusado como corrompido, e o pdf.js fecha', async () => {
    const motor = criarMotorFalso()
    const renderizador = criarRenderizadorFalso({ paginas: 3 })

    const aberto = await abrirArquivo(
      pdfDe('arvore-torta-4p.pdf'),
      { motor, renderizador },
      () => null,
    )

    expect(aberto).toEqual({ ok: false, recusa: { motivo: 'corrompido' } })
    expect(renderizador.fechados).toBe(1)
  })

  it('a falha do pdf.js vira a recusa com o motivo dele', async () => {
    const { motor, renderizador } = ferramentas()
    renderizador.abrir = jest.fn(() =>
      Promise.reject({ motivo: 'falha_do_navegador' }),
    )

    await expect(
      abrirArquivo(pdfDe('nota-2p.pdf'), { motor, renderizador }, () => null),
    ).resolves.toEqual({ ok: false, recusa: { motivo: 'falha_do_navegador' } })
  })
})

describe('a página em branco: onde entra e o tamanho (P2, P3, D3, D4)', () => {
  const DEITADA = { largura: 800, altura: 600 }

  // Cria a branca como a tela vai criar: o tamanho pela última marcada, depois a inserção.
  async function criar(
    documento: DocumentoDoEditor,
    paginas: PaginasComDesfazer,
  ) {
    const tamanho = await tamanhoDaNovaBranca(documento, paginas)
    const criada = adicionarBranca(documento, paginas, tamanho)
    if (!criada.ok) throw new Error('não coube')
    return criada
  }

  const documentoDe = (paginas = 3, tamanhos?: Record<number, Tamanho>) =>
    documentoInicial(arquivoDoEditor('a.pdf', paginas, 1_000, tamanhos))

  it('sem marcada: A4, no fim, já selecionada, com o id b0', async () => {
    const criada = await criar(documentoDe(), paginasIniciais(3))

    expect(criada.posicao).toBe(3)
    expect(criada.id).toBe('b0')
    expect(criada.paginas.lista.at(-1)).toEqual({
      id: 'b0',
      origem: { branca: TAMANHO_A4 },
      giro: 0,
    })
    expect(criada.paginas.marcadas).toEqual(['b0'])
  })

  it('com marcada: o tamanho dela, pedido ao pdf.js do arquivo dela, e entra logo depois', async () => {
    const documento = documentoDe(3, { 1: { largura: 300, altura: 500 } })
    const paginas = marcar(paginasIniciais(3), 'a0p1', true)

    const criada = await criar(documento, paginas)

    expect(documento.arquivos[0]!.aberto.tamanho).toHaveBeenCalledWith(1)
    expect(criada.posicao).toBe(2)
    expect(ids(criada.paginas.lista)).toEqual(['a0p0', 'a0p1', 'b0', 'a0p2'])
    expect(criada.paginas.lista[2].origem).toEqual({
      branca: { largura: 300, altura: 500 },
    })
  })

  it('a marcada girada 90° ou 270° aparece deitada: a branca sai deitada', async () => {
    for (const giro of [90, 270] as const) {
      let paginas = marcar(paginasIniciais(2), 'a0p0', true)
      paginas = {
        ...paginas,
        lista: paginas.lista.map((p, i) => (i === 0 ? { ...p, giro } : p)),
      }

      const criada = await criar(documentoDe(2), paginas)

      expect(criada.paginas.lista[1].origem).toEqual({ branca: DEITADA })
    }
  })

  // O pdf.js já mostra a página com o /Rotate dela; o giro do documento vem por cima.
  it('a página deitada pelo /Rotate do arquivo, girada de volta, dá uma branca de pé', async () => {
    let paginas = marcar(paginasIniciais(1), 'a0p0', true)
    paginas = { ...paginas, lista: [{ ...paginas.lista[0], giro: 90 }] }

    const criada = await criar(documentoDe(1, { 0: DEITADA }), paginas)

    expect(criada.paginas.lista[1].origem).toEqual({
      branca: { largura: 600, altura: 800 },
    })
  })

  it('a última marcada é a última que a pessoa marcou, não a última no documento (D4)', async () => {
    const documento = documentoDe(4, { 3: DEITADA })
    let paginas = marcar(paginasIniciais(4), 'a0p3', true)
    paginas = marcar(paginas, 'a0p0', true)

    const criada = await criar(documento, paginas)

    expect(criada.posicao).toBe(1)
    expect(criada.paginas.lista[1].origem).toEqual({
      branca: { largura: 600, altura: 800 },
    })
  })

  it('a última marcada que saiu da lista não vale: vale a marcada anterior, no lugar e no tamanho', async () => {
    const documento = documentoDe(3, { 2: DEITADA })
    let paginas = marcar(paginasIniciais(3), 'a0p2', true)
    paginas = marcar(paginas, 'a0p0', true)
    paginas = { ...paginas, lista: paginas.lista.slice(1) }

    const criada = await criar(documento, paginas)

    expect(ids(criada.paginas.lista)).toEqual(['a0p1', 'a0p2', 'b0'])
    expect(criada.paginas.lista[2].origem).toEqual({ branca: DEITADA })
  })

  it('a marcada de outro arquivo: o tamanho vem do documento do pdf.js dele', async () => {
    const b = arquivoDoEditor('b.pdf', 2, 1_000, { 1: DEITADA })
    const { documento } = comArquivo(documentoDe(1), b)
    const paginas = adicionarPaginas(
      paginasIniciais(1),
      paginasDoArquivo(1, 2),
    ).paginas

    const criada = await criar(documento, paginas)

    expect(b.aberto.tamanho).toHaveBeenCalledWith(1)
    expect(documento.arquivos[0]!.aberto.tamanho).not.toHaveBeenCalled()
    expect(criada.paginas.lista.at(-1)!.origem).toEqual({ branca: DEITADA })
  })

  it('a marcada é uma branca: o tamanho dela, com o giro dela', async () => {
    let paginas = (await criar(documentoDe(1), paginasIniciais(1))).paginas
    paginas = {
      ...paginas,
      lista: paginas.lista.map((p) => (p.id === 'b0' ? { ...p, giro: 90 } : p)),
    }

    const criada = await criar(documentoDe(1), paginas)

    expect(criada.id).toBe('b1')
    expect(criada.paginas.lista[2].origem).toEqual({
      branca: { largura: TAMANHO_A4.altura, altura: TAMANHO_A4.largura },
    })
  })

  // Menor do Crivo no #126: a página de verdade pode passar do limite dos leitores de PDF.
  it('a marcada com lado acima de 14.400 pontos dá uma branca A4', async () => {
    const documento = documentoDe(1, {
      0: { largura: 600, altura: LADO_MAXIMO_DA_PAGINA + 1 },
    })

    const criada = await criar(
      documento,
      marcar(paginasIniciais(1), 'a0p0', true),
    )

    expect(criada.paginas.lista[1].origem).toEqual({ branca: TAMANHO_A4 })
  })

  it('duas seguidas: a segunda entra depois da primeira, que ficou selecionada (D3), com outro id', async () => {
    const documento = documentoDe(2)
    const primeira = await criar(
      documento,
      marcar(paginasIniciais(2), 'a0p0', true),
    )

    const segunda = await criar(documento, primeira.paginas)

    expect(ids(segunda.paginas.lista)).toEqual(['a0p0', 'b0', 'b1', 'a0p1'])
    expect(segunda.paginas.marcadas).toEqual(['b1'])
  })

  it('é um passo do desfazer das páginas: desfazer tira a branca e devolve a seleção de antes', async () => {
    const antes = marcar(paginasIniciais(2), 'a0p1', true)

    const { paginas } = await criar(documentoDe(2), antes)
    const desfeito = desfazerPaginas(paginas)

    expect(paginas.passado).toHaveLength(1)
    expect(ids(desfeito.lista)).toEqual(['a0p0', 'a0p1'])
    expect(desfeito.marcadas).toEqual(['a0p1'])
  })

  it('o id não se repete depois de desfazer: a próxima branca é outra para a cena', async () => {
    const documento = documentoDe(1)
    const criada = await criar(documento, paginasIniciais(1))

    const depois = await criar(documento, desfazerPaginas(criada.paginas))

    expect(depois.id).toBe('b1')
    expect(ids(depois.paginas.lista)).toEqual(['a0p0', 'b1'])
  })
})

describe('a página em branco: o teto de 500 páginas somadas', () => {
  const comBrancas = async (arquivo: number, brancas: number) => {
    const documento = documentoInicial(arquivoDoEditor('a.pdf', arquivo))
    let paginas = paginasIniciais(arquivo)
    for (let i = 0; i < brancas; i++) {
      const criada = adicionarBranca(documento, paginas, TAMANHO_A4)
      if (!criada.ok) throw new Error('não coube')
      paginas = criada.paginas
    }
    return { documento, paginas }
  }

  it('as brancas contam uma vez cada, na lista ou só no desfazer', async () => {
    const { paginas } = await comBrancas(2, 3)
    expect(brancasAlcancaveis(paginas)).toBe(3)

    const semUma = mudarPaginas(paginas, apagarPaginas(paginas, [4]))
    expect(brancasAlcancaveis(semUma)).toBe(3)
    expect(brancasAlcancaveis(desfazerPaginas(desfazerPaginas(semUma)))).toBe(2)
  })

  it('cabe enquanto arquivos e brancas somam menos de 500; a que passa é recusada com o que ainda cabe, sem mexer nas páginas', async () => {
    const { documento, paginas } = await comBrancas(TETO_DE_PAGINAS - 2, 1)

    const ultima = adicionarBranca(documento, paginas, TAMANHO_A4)
    expect(ultima.ok).toBe(true)
    if (!ultima.ok) return

    const recusada = adicionarBranca(documento, ultima.paginas, TAMANHO_A4)
    expect(recusada).toEqual({
      ok: false,
      restam: { bytes: TETO_DE_BYTES_COM_MINIATURAS - 1_000, paginas: 0 },
    })
  })

  it('as brancas contam no teto do PDF adicionado', async () => {
    const { documento, paginas } = await comBrancas(450, 3)
    const brancas = brancasAlcancaveis(paginas)

    expect(ocupacaoDe(documento, brancas)).toEqual({
      bytes: 1_000,
      paginas: 453,
    })
    expect(cabeNoEditor(documento, { bytes: 1, paginas: 48 }, brancas)).toEqual(
      {
        cabe: false,
        passou: 'paginas',
        restam: { bytes: TETO_DE_BYTES_COM_MINIATURAS - 1_000, paginas: 47 },
      },
    )
    expect(
      cabeNoEditor(documento, { bytes: 1, paginas: 47 }, brancas).cabe,
    ).toBe(true)
  })
})

describe('a página em branco no resto do documento', () => {
  const branca = (id: string, giro: 0 | 90 = 0): PaginaDaBancada => ({
    id,
    origem: { branca: TAMANHO_A4 },
    giro,
  })

  it('não tem arquivo: doArquivo a recusa, e ela não alcança arquivo nenhum', () => {
    const documento = documentoInicial(arquivoDoEditor('a.pdf', 1))
    expect(() => doArquivo(documento, { branca: TAMANHO_A4 })).toThrow(
      RangeError,
    )

    const paginas = mudarPaginas(paginasIniciais(1), {
      lista: [branca('b0')],
      marcadas: [],
    })
    expect(arquivosAlcancaveis(paginas)).toEqual(new Set([0]))
    expect(arquivosAlcancaveis({ ...paginas, passado: [] })).toEqual(new Set())
  })

  it('o pedido ao motor leva a branca como ela é, entre as páginas renumeradas', () => {
    const { documento } = comArquivo(
      documentoInicial(arquivoDoEditor('a.pdf', 1)),
      arquivoDoEditor('b.pdf', 1),
    )
    const paginaDe = (arquivo: number): PaginaParaMontar => ({
      id: `a${arquivo}p0`,
      origem: { arquivo, indice: 0 },
      giro: 0,
      moldura: 0,
    })
    const daBranca: PaginaParaMontar = { ...branca('b0', 90), moldura: 90 }

    const pedido = pedidoDeArquivos(documento, [paginaDe(1), daBranca])

    expect(pedido.arquivos.map(({ name }) => name)).toEqual(['b.pdf'])
    expect(pedido.paginas).toEqual([
      { ...paginaDe(1), origem: { arquivo: 0, indice: 0 } },
      daBranca,
    ])
    expect(pedido.porCopia).toBe(true)
  })

  it('só brancas: nenhum arquivo vai ao motor, e sai por cópia', () => {
    const documento = documentoInicial(arquivoDoEditor('a.pdf', 1))
    const daBranca: PaginaParaMontar = { ...branca('b0'), moldura: 0 }

    expect(pedidoDeArquivos(documento, [daBranca])).toEqual({
      arquivos: [],
      paginas: [daBranca],
      porCopia: true,
    })
  })

  describe('o nome do PDF baixado', () => {
    const { documento } = comArquivo(
      documentoInicial(arquivoDoEditor('contrato.pdf', 2)),
      arquivoDoEditor('anexo.pdf', 2),
    )
    const deArquivo = (arquivo: number): PaginaDaBancada => ({
      id: `a${arquivo}p0`,
      origem: { arquivo, indice: 0 },
      giro: 0,
    })

    it('vem do primeiro arquivo da sessão que tem página no PDF, mesmo depois de uma branca', () => {
      expect(
        nomeDoPdfBaixado(
          documento,
          [branca('b0'), deArquivo(1), deArquivo(0)],
          'editado',
        ),
      ).toBe('contrato-editado.pdf')
      expect(
        nomeDoPdfBaixado(documento, [branca('b0'), deArquivo(1)], 'paginas'),
      ).toBe('anexo-paginas.pdf')
    })

    it('só com brancas, nenhum arquivo dá o nome: paginas-em-branco', () => {
      expect(nomeDoPdfBaixado(documento, [branca('b0')], 'editado')).toBe(
        'paginas-em-branco-editado.pdf',
      )
      expect(
        nomeDoPdfBaixado(documento, [branca('b0'), branca('b1')], 'paginas'),
      ).toBe('paginas-em-branco-paginas.pdf')
    })
  })
})
