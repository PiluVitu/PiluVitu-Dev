import {
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
} from '@piluvitu/tools/pdf-regras'
import {
  apagarPaginas,
  desfazerPaginas,
  marcar,
  mudarPaginas,
  paginasIniciais,
  type PaginaDaBancada,
} from './bancada'
import {
  abrirArquivo,
  adicionarPaginas,
  arquivosAlcancaveis,
  cabeNoEditor,
  comArquivo,
  doArquivo,
  documentoInicial,
  ocupacaoDe,
  paginasDoArquivo,
  pedidoDeArquivos,
  semInalcancaveis,
  type ArquivoDoEditor,
} from './documento-do-editor'
import type { PaginaParaMontar } from './motor'
import { criarMotorFalso } from './motor-falso'
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

function abertoFalso(paginas: number): DocumentoAberto & { fechado: boolean } {
  const aberto = {
    paginas,
    fechado: false,
    miniatura: jest.fn(),
    pagina: jest.fn(),
    fundo: jest.fn(),
    textoNoPonto: jest.fn(),
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
): ArquivoDoEditor {
  return {
    arquivo: pdfDe(nome, bytes),
    paginas,
    avisos: [],
    aberto: abertoFalso(paginas),
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
