import {
  BlendMode,
  LineCapStyle,
  PDFArray,
  PDFContentStream,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  ParseSpeeds,
  StandardFonts,
  concatTransformationMatrix,
  decodePDFRawStream,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFObject,
  type PDFPage,
} from 'pdf-lib'
import {
  CANTOS,
  FAMILIAS_DE_FONTE,
  GIROS,
  OPACIDADE_DO_MARCA_TEXTO,
  TIPOS_DE_OBJETO,
  caracteresForaDoWinAnsi,
  componentesDaCor,
  corValida,
  extremosDaLinha,
  geometriaDaSeta,
  giroNormalizado,
  linhasDeBase,
  matrizDaTelaParaPdf,
  tamanhoNaTela,
  tipoDaImagem,
  type FamiliaDaFonte,
  type GeometriaDaPagina,
  type MotivoDoErroDePdf,
  type MotivoDoErroNaEdicao,
  type ObjetoDaPagina,
  type PaginaDoPlano,
} from './pdf-regras'
import { caminhoDoTraco } from './pdf-traco'

export type {
  Giro,
  MotivoDoErroDePdf,
  MotivoDoErroNaEdicao,
  ObjetoDaPagina,
  PaginaDoPlano,
} from './pdf-regras'

export class ErroDePdf extends Error {
  readonly motivo: MotivoDoErroDePdf
  readonly indice: number | undefined

  constructor(motivo: MotivoDoErroDePdf, indice?: number) {
    super(indice === undefined ? motivo : `${motivo} (arquivo ${indice})`)
    this.name = 'ErroDePdf'
    this.motivo = motivo
    this.indice = indice
  }
}

const CABECALHO = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
// O cabeçalho pode vir depois de lixo, desde que dentro dos primeiros 1024 bytes (ISO 32000, anexo H).
const JANELA_DO_CABECALHO = 1024
const MARCA_DE_CRIPTOGRAFIA = [...'/Encrypt'].map((c) => c.charCodeAt(0))

function contem(
  bytes: Uint8Array,
  trecho: readonly number[],
  ate = bytes.length,
): boolean {
  const ultimo = Math.min(bytes.length, ate) - trecho.length
  for (let i = 0; i <= ultimo; i++) {
    let j = 0
    while (j < trecho.length && bytes[i + j] === trecho[j]) j++
    if (j === trecho.length) return true
  }
  return false
}

export function temCabecalhoDePdf(bytes: Uint8Array): boolean {
  return contem(bytes, CABECALHO, JANELA_DO_CABECALHO)
}

async function abrir(bytes: Uint8Array): Promise<PDFDocument> {
  if (!temCabecalhoDePdf(bytes)) throw new ErroDePdf('nao_e_pdf')
  let documento: PDFDocument
  try {
    documento = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      parseSpeed: ParseSpeeds.Fastest,
    })
  } catch {
    // Com object streams cifrados o parser quebra antes de ler o trailer: o /Encrypt cru decide.
    throw new ErroDePdf(
      contem(bytes, MARCA_DE_CRIPTOGRAFIA) ? 'protegido' : 'corrompido',
    )
  }
  if (documento.isEncrypted) throw new ErroDePdf('protegido')
  let paginas: number
  try {
    paginas = documento.getPageCount()
  } catch {
    throw new ErroDePdf('corrompido')
  }
  if (paginas === 0) throw new ErroDePdf('sem_paginas')
  return documento
}

export async function contarPaginas(bytes: Uint8Array): Promise<number> {
  return (await abrir(bytes)).getPageCount()
}

async function copiarPaginas(
  destino: PDFDocument,
  bytes: Uint8Array,
): Promise<void> {
  const origem = await abrir(bytes)
  try {
    // Uma chamada só por arquivo: cada copyPages tem o próprio cache, e copiar página a página
    // duplicaria fontes e imagens compartilhadas.
    const copiadas = await destino.copyPages(origem, origem.getPageIndices())
    for (const pagina of copiadas) destino.addPage(pagina)
  } catch {
    throw new ErroDePdf('corrompido')
  }
}

export type FonteDePdf = Uint8Array | (() => Promise<Uint8Array>)

export type EtapaDaMesclagem = { arquivo: number } | { salvando: true }

export async function mesclarPdfs(
  fontes: readonly FonteDePdf[],
  aoAvancar?: (etapa: EtapaDaMesclagem) => void,
): Promise<Uint8Array> {
  const destino = await PDFDocument.create({ updateMetadata: false })
  for (const [indice, fonte] of fontes.entries()) {
    aoAvancar?.({ arquivo: indice })
    try {
      await copiarPaginas(
        destino,
        typeof fonte === 'function' ? await fonte() : fonte,
      )
    } catch (erro) {
      if (erro instanceof ErroDePdf) throw new ErroDePdf(erro.motivo, indice)
      throw erro
    }
  }
  aoAvancar?.({ salvando: true })
  return destino.save({ objectsPerTick: Infinity })
}

function conferirPlano(plano: readonly PaginaDoPlano[]): void {
  if (plano.length === 0) throw new RangeError('o plano não tem página')
  const vistos = new Set<number>()
  for (const { indice, giro } of plano) {
    if (!Number.isInteger(indice) || indice < 0) {
      throw new RangeError(`índice de página inválido: ${indice}`)
    }
    if (vistos.has(indice)) {
      throw new RangeError(`página repetida no plano: ${indice}`)
    }
    if (!GIROS.includes(giro)) throw new RangeError(`giro inválido: ${giro}`)
    vistos.add(indice)
  }
}

// Como o pdf.js, que desenhou a miniatura: /Rotate que não é múltiplo de 90 vale 0.
function rotacaoAtual(pagina: PDFPage): number {
  let graus: number
  try {
    graus = pagina.getRotation().angle
  } catch {
    return 0
  }
  return Number.isInteger(graus) && graus % 90 === 0 ? graus : 0
}

// Um link ou anotação de uma página que fica pode apontar para uma que saiu, e o copyPages
// levaria o conteúdo dela junto, solto no arquivo. Vazia, só sobra o /Type.
function esvaziarPaginasForaDoPlano(
  origem: PDFDocument,
  plano: readonly PaginaDoPlano[],
): void {
  const paginas = origem.getPages()
  const ficam = new Set(plano.map(({ indice }) => paginas[indice].node))
  for (const { node } of paginas) {
    if (ficam.has(node)) continue
    for (const chave of node.keys()) {
      if (chave !== PDFName.Type) node.delete(chave)
    }
  }
}

export async function organizarPaginas(
  bytes: Uint8Array,
  plano: readonly PaginaDoPlano[],
): Promise<Uint8Array> {
  conferirPlano(plano)
  const origem = await abrir(bytes)
  const total = origem.getPageCount()
  for (const { indice } of plano) {
    if (indice >= total) {
      throw new RangeError(`página fora do documento: ${indice} de ${total}`)
    }
  }
  const destino = await PDFDocument.create({ updateMetadata: false })
  let copiadas: PDFPage[]
  try {
    esvaziarPaginasForaDoPlano(origem, plano)
    copiadas = await destino.copyPages(
      origem,
      plano.map(({ indice }) => indice),
    )
  } catch {
    throw new ErroDePdf('corrompido')
  }
  copiadas.forEach((pagina, posicao) => {
    pagina.setRotation(
      degrees(giroNormalizado(rotacaoAtual(pagina) + plano[posicao].giro)),
    )
    destino.addPage(pagina)
  })
  return destino.save({ objectsPerTick: Infinity })
}

export type EdicaoDaPagina = {
  readonly indice: number
  readonly objetos: readonly ObjetoDaPagina[]
  // Apagar de verdade: o JPEG da página como a tela a mostra, com os retângulos de cobrir já pintados nele.
  readonly fundo?: Uint8Array
}

export class ErroNaEdicao extends Error {
  readonly motivo: MotivoDoErroNaEdicao
  readonly pagina: number
  readonly objeto: number | undefined
  readonly caracteres: readonly string[]

  constructor(
    motivo: MotivoDoErroNaEdicao,
    pagina: number,
    objeto?: number,
    caracteres: readonly string[] = [],
  ) {
    const onde =
      objeto === undefined
        ? `página ${pagina}, fundo`
        : `página ${pagina}, objeto ${objeto}`
    super(
      `${motivo} (${onde})${caracteres.length ? `: ${caracteres.join(' ')}` : ''}`,
    )
    this.name = 'ErroNaEdicao'
    this.motivo = motivo
    this.pagina = pagina
    this.objeto = objeto
    this.caracteres = caracteres
  }
}

const ehBytes = (valor: unknown): valor is Uint8Array =>
  Object.prototype.toString.call(valor) === '[object Uint8Array]'

const finito = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isFinite(valor)

// Os objetos chegam ao Worker por postMessage: o tipo não garante nada em tempo de execução, e um NaN
// escrito no content stream estraga a página sem erro.
function conferirObjeto(objeto: ObjetoDaPagina, onde: string): void {
  const falhar = (campo: string): never => {
    throw new RangeError(`objeto inválido (${onde}): ${campo}`)
  }
  if (typeof objeto !== 'object' || objeto === null) falhar('objeto')
  if (!TIPOS_DE_OBJETO.includes(objeto.tipo)) falhar('tipo')
  for (const campo of ['x', 'y', 'largura', 'altura'] as const) {
    if (!finito(objeto[campo])) falhar(campo)
  }
  if (objeto.largura < 0 || objeto.altura < 0) falhar('tamanho negativo')
  if ('cor' in objeto && !corValida(objeto.cor)) falhar('cor')
  if (
    'espessura' in objeto &&
    !(finito(objeto.espessura) && objeto.espessura > 0)
  ) {
    falhar('espessura')
  }
  switch (objeto.tipo) {
    case 'texto':
      if (typeof objeto.conteudo !== 'string') falhar('conteudo')
      if (!FAMILIAS_DE_FONTE.includes(objeto.fonte)) falhar('fonte')
      if (typeof objeto.negrito !== 'boolean') falhar('negrito')
      if (typeof objeto.italico !== 'boolean') falhar('italico')
      if (!(finito(objeto.tamanho) && objeto.tamanho > 0)) falhar('tamanho')
      return
    case 'imagem':
      if (!ehBytes(objeto.bytes)) falhar('bytes')
      return
    case 'traco':
      if (
        !Array.isArray(objeto.pontos) ||
        !objeto.pontos.every(
          (ponto) =>
            Array.isArray(ponto) &&
            (ponto.length === 2 || ponto.length === 3) &&
            ponto.every(finito),
        )
      ) {
        falhar('pontos')
      }
      return
    case 'linha':
    case 'seta':
      if (!CANTOS.includes(objeto.inicio)) falhar('inicio')
      return
  }
}

function conferirEdicoes(edicoes: readonly EdicaoDaPagina[]): void {
  if (!Array.isArray(edicoes)) throw new RangeError('edições inválidas')
  const vistas = new Set<number>()
  for (const { indice, objetos, fundo } of edicoes) {
    if (!Number.isInteger(indice) || indice < 0) {
      throw new RangeError(`índice de página inválido: ${indice}`)
    }
    if (vistas.has(indice)) {
      throw new RangeError(`página repetida nas edições: ${indice}`)
    }
    vistas.add(indice)
    if (!Array.isArray(objetos)) {
      throw new RangeError(`objetos inválidos na página ${indice}`)
    }
    if (fundo !== undefined && !ehBytes(fundo)) {
      throw new RangeError(`fundo inválido na página ${indice}`)
    }
    if (fundo !== undefined && tipoDaImagem(fundo) !== 'jpeg') {
      throw new ErroNaEdicao('imagem_nao_aceita', indice)
    }
    objetos.forEach((objeto, posicao) => {
      conferirObjeto(objeto, `página ${indice}, objeto ${posicao}`)
      if (objeto.tipo === 'texto') {
        const fora = caracteresForaDoWinAnsi(objeto.conteudo)
        if (fora.length) {
          throw new ErroNaEdicao('texto_fora_do_winansi', indice, posicao, fora)
        }
      }
      if (objeto.tipo === 'imagem' && tipoDaImagem(objeto.bytes) === null) {
        throw new ErroNaEdicao('imagem_nao_aceita', indice, posicao)
      }
    })
  }
}

// Mesma leitura do pdf.js (Page.view, rotate e userUnit), para o desenho cair onde a tela mostrou.
const CARTA = [0, 0, 612, 792]

function caixaDaPagina(pagina: PDFPage, nome: string): number[] | null {
  const { context } = pagina.doc
  const valor = context.lookup(
    pagina.node.getInheritableAttribute(PDFName.of(nome)),
  )
  if (!(valor instanceof PDFArray) || valor.size() !== 4) return null
  const numeros = valor
    .asArray()
    .map((item) => context.lookup(item))
    .map((item) => (item instanceof PDFNumber ? item.asNumber() : NaN))
  if (!numeros.every(Number.isFinite)) return null
  const [a, b, c, d] = numeros
  const caixa = [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
  return caixa[2] - caixa[0] > 0 && caixa[3] - caixa[1] > 0 ? caixa : null
}

function geometriaDaPagina(pagina: PDFPage): GeometriaDaPagina {
  const midia = caixaDaPagina(pagina, 'MediaBox') ?? CARTA
  const corte = caixaDaPagina(pagina, 'CropBox') ?? midia
  const juntas = [
    Math.max(midia[0], corte[0]),
    Math.max(midia[1], corte[1]),
    Math.min(midia[2], corte[2]),
    Math.min(midia[3], corte[3]),
  ]
  const [x1, y1, x2, y2] =
    juntas[2] - juntas[0] > 0 && juntas[3] - juntas[1] > 0 ? juntas : midia
  const unidade = pagina.doc.context.lookup(
    pagina.node.get(PDFName.of('UserUnit')),
  )
  return {
    caixa: { x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 },
    rotacao: giroNormalizado(rotacaoAtual(pagina)),
    unidade:
      unidade instanceof PDFNumber && unidade.asNumber() > 0
        ? unidade.asNumber()
        : 1,
  }
}

const FONTES: Record<FamiliaDaFonte, readonly StandardFonts[]> = {
  helvetica: [
    StandardFonts.Helvetica,
    StandardFonts.HelveticaBold,
    StandardFonts.HelveticaOblique,
    StandardFonts.HelveticaBoldOblique,
  ],
  times: [
    StandardFonts.TimesRoman,
    StandardFonts.TimesRomanBold,
    StandardFonts.TimesRomanItalic,
    StandardFonts.TimesRomanBoldItalic,
  ],
  courier: [
    StandardFonts.Courier,
    StandardFonts.CourierBold,
    StandardFonts.CourierOblique,
    StandardFonts.CourierBoldOblique,
  ],
}

class Recursos {
  private readonly fontes = new Map<StandardFonts, PDFFont>()
  private readonly imagens = new Map<Uint8Array, PDFImage>()

  constructor(private readonly documento: PDFDocument) {}

  fonte(familia: FamiliaDaFonte, negrito: boolean, italico: boolean): PDFFont {
    const nome = FONTES[familia][(negrito ? 1 : 0) + (italico ? 2 : 0)]
    let fonte = this.fontes.get(nome)
    if (!fonte) {
      fonte = this.documento.embedStandardFont(nome)
      this.fontes.set(nome, fonte)
    }
    return fonte
  }

  async imagem(
    bytes: Uint8Array,
    pagina: number,
    objeto?: number,
  ): Promise<PDFImage> {
    let imagem = this.imagens.get(bytes)
    if (imagem) return imagem
    const tipo = tipoDaImagem(bytes)
    if (tipo === null)
      throw new ErroNaEdicao('imagem_nao_aceita', pagina, objeto)
    try {
      imagem =
        tipo === 'png'
          ? await this.documento.embedPng(bytes)
          : await this.documento.embedJpg(bytes)
    } catch {
      throw new ErroNaEdicao('imagem_corrompida', pagina, objeto)
    }
    this.imagens.set(bytes, imagem)
    return imagem
  }
}

const corDoPdf = (cor: string) => rgb(...componentesDaCor(cor))

const BRANCO = rgb(1, 1, 1)

// Dentro do desenho, as coordenadas são as da tela com o y para cima (origem no canto inferior esquerdo da
// página como a tela a mostra), que é o que o drawText, o drawRectangle e os outros do pdf-lib esperam.
async function desenharObjeto(
  pagina: PDFPage,
  objeto: ObjetoDaPagina,
  altura: number,
  recursos: Recursos,
  indice: number,
  posicao: number,
): Promise<void> {
  const embaixo = altura - objeto.y - objeto.altura
  switch (objeto.tipo) {
    case 'texto': {
      const font = recursos.fonte(objeto.fonte, objeto.negrito, objeto.italico)
      for (const linha of linhasDeBase(objeto)) {
        if (!linha.conteudo) continue
        pagina.drawText(linha.conteudo, {
          x: linha.x,
          y: altura - linha.y,
          size: objeto.tamanho,
          font,
          color: corDoPdf(objeto.cor),
        })
      }
      return
    }
    case 'imagem':
      pagina.drawImage(await recursos.imagem(objeto.bytes, indice, posicao), {
        x: objeto.x,
        y: embaixo,
        width: objeto.largura,
        height: objeto.altura,
      })
      return
    case 'traco': {
      const caminho = caminhoDoTraco(objeto)
      if (caminho) {
        pagina.drawSvgPath(caminho, {
          x: 0,
          y: altura,
          color: corDoPdf(objeto.cor),
        })
      }
      return
    }
    case 'retangulo':
      pagina.drawRectangle({
        x: objeto.x,
        y: embaixo,
        width: objeto.largura,
        height: objeto.altura,
        borderColor: corDoPdf(objeto.cor),
        borderWidth: objeto.espessura,
      })
      return
    case 'elipse':
      pagina.drawEllipse({
        x: objeto.x + objeto.largura / 2,
        y: embaixo + objeto.altura / 2,
        xScale: objeto.largura / 2,
        yScale: objeto.altura / 2,
        borderColor: corDoPdf(objeto.cor),
        borderWidth: objeto.espessura,
      })
      return
    case 'linha':
    case 'seta': {
      const { de, ate } = extremosDaLinha(objeto)
      const seta =
        objeto.tipo === 'seta'
          ? geometriaDaSeta(de, ate, objeto.espessura)
          : null
      const haste = seta ? seta.haste : { de, ate }
      if (haste.de.x !== haste.ate.x || haste.de.y !== haste.ate.y) {
        pagina.drawLine({
          start: { x: haste.de.x, y: altura - haste.de.y },
          end: { x: haste.ate.x, y: altura - haste.ate.y },
          thickness: objeto.espessura,
          color: corDoPdf(objeto.cor),
          lineCap: LineCapStyle.Round,
        })
      }
      if (seta?.ponta) {
        const [a, b, c] = seta.ponta.map(({ x, y }) => `${x} ${y}`)
        pagina.drawSvgPath(`M ${a} L ${b} L ${c} Z`, {
          x: 0,
          y: altura,
          color: corDoPdf(objeto.cor),
        })
      }
      return
    }
    case 'marca-texto':
      pagina.drawRectangle({
        x: objeto.x,
        y: embaixo,
        width: objeto.largura,
        height: objeto.altura,
        color: corDoPdf(objeto.cor),
        opacity: OPACIDADE_DO_MARCA_TEXTO,
        blendMode: BlendMode.Multiply,
      })
      return
    case 'cobrir':
      pagina.drawRectangle({
        x: objeto.x,
        y: embaixo,
        width: objeto.largura,
        height: objeto.altura,
        color: BRANCO,
      })
      return
  }
}

async function desenharNaPagina(
  pagina: PDFPage,
  geometria: GeometriaDaPagina,
  objetos: readonly ObjetoDaPagina[],
  recursos: Recursos,
  indice: number,
  semCobrir = false,
): Promise<void> {
  const desenhados = [...objetos.entries()].filter(
    ([, { tipo }]) => !(semCobrir && tipo === 'cobrir'),
  )
  if (desenhados.length === 0) return
  const { altura } = tamanhoNaTela(geometria)
  // O pdf-lib já põe o conteúdo antigo entre q e Q, então um cm que ele deixe aberto não chega até aqui.
  pagina.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(...matrizDaTelaParaPdf(geometria)),
    concatTransformationMatrix(1, 0, 0, -1, 0, altura),
  )
  for (const [posicao, objeto] of desenhados) {
    await desenharObjeto(pagina, objeto, altura, recursos, indice, posicao)
  }
  pagina.pushOperators(popGraphicsState())
}

function referenciasDasAnotacoes(pagina: PDFPage): PDFRef[] {
  const anotacoes = pagina.doc.context.lookup(pagina.node.get(PDFName.Annots))
  if (!(anotacoes instanceof PDFArray)) return []
  return anotacoes
    .asArray()
    .filter((item): item is PDFRef => item instanceof PDFRef)
}

// Apagar de verdade: a página fica só com o tipo e o pai. Rotação, caixas e recursos vão explícitos,
// senão seriam herdados da árvore de páginas.
function esvaziarPagina(
  pagina: PDFPage,
  largura: number,
  altura: number,
): void {
  const { node } = pagina
  for (const chave of node.keys()) {
    if (chave !== PDFName.Type && chave !== PDFName.Parent) node.delete(chave)
  }
  pagina.setMediaBox(0, 0, largura, altura)
  pagina.setCropBox(0, 0, largura, altura)
  pagina.setRotation(degrees(0))
  node.set(PDFName.Resources, pagina.doc.context.obj({}))
}

// Percorre tudo o que se alcança a partir do trailer; `visitar` vê cada dicionário e array antes dos filhos.
function percorrer(
  contexto: PDFContext,
  visitar?: (objeto: PDFDict | PDFArray) => void,
): Set<PDFRef> {
  const referencias = new Set<PDFRef>()
  const vistos = new Set<PDFDict | PDFArray>()
  const pilha: (PDFObject | undefined)[] = [
    contexto.trailerInfo.Root,
    contexto.trailerInfo.Info,
  ]
  while (pilha.length > 0) {
    let objeto = pilha.pop()
    if (objeto instanceof PDFRef) {
      if (referencias.has(objeto)) continue
      referencias.add(objeto)
      objeto = contexto.lookup(objeto)
    }
    if (objeto instanceof PDFStream) objeto = objeto.dict
    if (!(objeto instanceof PDFDict || objeto instanceof PDFArray)) continue
    if (vistos.has(objeto)) continue
    vistos.add(objeto)
    visitar?.(objeto)
    for (const filho of objeto instanceof PDFDict
      ? objeto.values()
      : objeto.asArray()) {
      pilha.push(filho)
    }
  }
  return referencias
}

const TEXTOS_DA_ESTRUTURA = ['ActualText', 'Alt', 'E', 'T'].map((nome) =>
  PDFName.of(nome),
)

// Tira de todo o documento as referências aos objetos removidos (anotações da página apagada e,
// depois, os campos que ficaram sem widget), e o texto alternativo da estrutura que aponta para ela.
function desligar(
  contexto: PDFContext,
  removidos: Set<PDFRef>,
  paginasApagadas: Set<PDFRef>,
): Set<PDFArray> {
  const mexidos = new Set<PDFArray>()
  percorrer(contexto, (objeto) => {
    if (objeto instanceof PDFArray) {
      for (let i = objeto.size() - 1; i >= 0; i--) {
        const item = objeto.get(i)
        if (item instanceof PDFRef && removidos.has(item)) {
          objeto.remove(i)
          mexidos.add(objeto)
        }
      }
      return
    }
    const pagina = objeto.get(PDFName.of('Pg'))
    if (pagina instanceof PDFRef && paginasApagadas.has(pagina)) {
      for (const chave of TEXTOS_DA_ESTRUTURA) objeto.delete(chave)
    }
    for (const [chave, valor] of objeto.entries()) {
      if (valor instanceof PDFRef && removidos.has(valor)) objeto.delete(chave)
    }
  })
  return mexidos
}

// Campo de formulário que perdeu todos os widgets ainda guarda o valor (/V): sai junto.
function camposSemWidget(
  documento: PDFDocument,
  mexidos: Set<PDFArray>,
): Set<PDFRef> {
  const { context } = documento
  const vazios = new Set<PDFRef>()
  const formulario = documento.catalog.lookupMaybe(
    PDFName.of('AcroForm'),
    PDFDict,
  )
  const raiz = formulario?.lookupMaybe(PDFName.of('Fields'), PDFArray)
  if (!raiz) return vazios
  const vistos = new Set<PDFDict>()
  const pilha: PDFArray[] = [raiz]
  while (pilha.length > 0) {
    for (const item of pilha.pop()!.asArray()) {
      const campo = context.lookup(item)
      if (!(campo instanceof PDFDict) || vistos.has(campo)) continue
      vistos.add(campo)
      const filhos = campo.lookupMaybe(PDFName.of('Kids'), PDFArray)
      if (!filhos) continue
      if (
        filhos.size() === 0 &&
        mexidos.has(filhos) &&
        item instanceof PDFRef
      ) {
        vazios.add(item)
      }
      pilha.push(filhos)
    }
  }
  return vazios
}

// O pdf-lib salva todo objeto que leu, alcançável ou não: sem isto, o conteúdo antigo da página apagada
// (e o que sobrou solto de edições anteriores do arquivo) iria para o PDF novo.
function soltarInalcancaveis(contexto: PDFContext): void {
  const alcancaveis = percorrer(contexto)
  for (const [referencia] of contexto.enumerateIndirectObjects()) {
    if (!alcancaveis.has(referencia)) contexto.delete(referencia)
  }
}

const BRANCOS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIMITADORES = new Set([...'()<>[]{}/%'].map((c) => c.charCodeAt(0)))
const regular = (byte: number) => !BRANCOS.has(byte) && !DELIMITADORES.has(byte)

function nomeEm(bytes: Uint8Array, inicio: number, fim: number): string {
  let nome = ''
  for (let i = inicio; i < fim; i++) nome += String.fromCharCode(bytes[i])
  return nome
}

// Os nomes que o conteúdo desenha com Do. Na dúvida (imagem embutida, string sem fim), devolve null.
function nomesDesenhados(conteudo: Uint8Array): Set<string> | null {
  const nomes = new Set<string>()
  let nome: string | null = null
  let i = 0
  while (i < conteudo.length) {
    const byte = conteudo[i]
    if (BRANCOS.has(byte)) {
      i++
    } else if (byte === 0x25) {
      while (
        i < conteudo.length &&
        conteudo[i] !== 0x0a &&
        conteudo[i] !== 0x0d
      )
        i++
    } else if (byte === 0x2f) {
      let fim = i + 1
      while (fim < conteudo.length && regular(conteudo[fim])) fim++
      nome = nomeEm(conteudo, i + 1, fim)
      i = fim
    } else if (byte === 0x28) {
      let nivel = 0
      do {
        if (conteudo[i] === 0x5c) i++
        else if (conteudo[i] === 0x28) nivel++
        else if (conteudo[i] === 0x29) nivel--
        i++
      } while (nivel > 0 && i < conteudo.length)
      if (nivel > 0) return null
      nome = null
    } else if (byte === 0x3c && conteudo[i + 1] !== 0x3c) {
      const fim = conteudo.indexOf(0x3e, i)
      if (fim < 0) return null
      i = fim + 1
      nome = null
    } else if (!regular(byte)) {
      i += (byte === 0x3c || byte === 0x3e) && conteudo[i + 1] === byte ? 2 : 1
      nome = null
    } else {
      let fim = i
      while (fim < conteudo.length && regular(conteudo[fim])) fim++
      const operador = nomeEm(conteudo, i, fim)
      if (operador === 'BI') return null
      if (operador === 'Do' && nome !== null) nomes.add(nome)
      nome = null
      i = fim
    }
  }
  return nomes
}

function bytesDoConteudo(
  contexto: PDFContext,
  valor: PDFObject | undefined,
): Uint8Array | null {
  const alvo = contexto.lookup(valor)
  const streams =
    alvo instanceof PDFArray
      ? alvo.asArray().map((item) => contexto.lookup(item))
      : alvo === undefined
        ? []
        : [alvo]
  const partes: Uint8Array[] = []
  for (const stream of streams) {
    if (stream instanceof PDFContentStream) {
      partes.push(stream.getUnencodedContents())
    } else if (stream instanceof PDFRawStream) {
      try {
        partes.push(decodePDFRawStream(stream).decode())
      } catch {
        return null
      }
    } else {
      return null
    }
  }
  // Um operando pode estar num stream e o operador no seguinte: os streams da página são um conteúdo só.
  const juntos = new Uint8Array(
    partes.reduce((soma, p) => soma + p.length + 1, 0),
  )
  let posicao = 0
  for (const parte of partes) {
    juntos.set(parte, posicao)
    juntos[posicao + parte.length] = 0x20
    posicao += parte.length + 1
  }
  return juntos
}

function xobjetosDosRecursos(
  contexto: PDFContext,
  recursos: PDFObject | undefined,
): PDFDict | undefined {
  const dicionario = contexto.lookup(recursos)
  if (!(dicionario instanceof PDFDict)) return undefined
  const xobjetos = contexto.lookup(dicionario.get(PDFName.XObject))
  return xobjetos instanceof PDFDict ? xobjetos : undefined
}

// Junta em `usados` os XObjects que o conteúdo desenha, entrando nos formulários sem recursos próprios
// (eles desenham com os de quem os chamou). Devolve false quando não dá para ler o conteúdo com certeza.
function juntarUsados(
  contexto: PDFContext,
  conteudo: Uint8Array | null,
  xobjetos: PDFDict,
  usados: Set<PDFName>,
  vistos: Set<PDFStream>,
): boolean {
  const nomes = conteudo && nomesDesenhados(conteudo)
  if (!nomes) return false
  for (const nome of nomes) {
    const chave = PDFName.of(nome)
    usados.add(chave)
    const alvo = contexto.lookup(xobjetos.get(chave))
    if (
      alvo instanceof PDFStream &&
      !vistos.has(alvo) &&
      alvo.dict.get(PDFName.of('Subtype')) === PDFName.of('Form') &&
      !alvo.dict.has(PDFName.Resources)
    ) {
      vistos.add(alvo)
      if (
        !juntarUsados(
          contexto,
          bytesDoConteudo(contexto, alvo),
          xobjetos,
          usados,
          vistos,
        )
      ) {
        return false
      }
    }
  }
  return true
}

function nosDaArvoreDePaginas(documento: PDFDocument): PDFDict[] {
  const { context } = documento
  const nos: PDFDict[] = []
  const pilha: PDFObject[] = [documento.catalog.get(PDFName.of('Pages'))!]
  const vistos = new Set<PDFDict>()
  while (pilha.length > 0) {
    const no = context.lookup(pilha.pop())
    if (!(no instanceof PDFDict) || vistos.has(no)) continue
    vistos.add(no)
    if (no.get(PDFName.Type) !== PDFName.of('Pages')) continue
    nos.push(no)
    const filhos = context.lookup(no.get(PDFName.of('Kids')))
    if (filhos instanceof PDFArray) {
      for (const filho of filhos.asArray()) pilha.push(filho)
    }
  }
  return nos
}

// O que a página apagada desenhava pode estar num dicionário de recursos que outras páginas herdam ou
// também listam: o objeto continuaria no arquivo. Sai de cada dicionário o que veio da página apagada e
// nenhuma página que fica desenha; se o conteúdo de uma delas não dá para ler com certeza, nada sai dele.
function soltarXObjectsDasApagadas(
  documento: PDFDocument,
  candidatos: Set<PDFRef>,
  apagadas: Set<PDFRef>,
): void {
  const { context } = documento
  const usos = new Map<PDFDict, { usados: Set<PDFName>; certo: boolean }>()
  for (const pagina of documento.getPages()) {
    if (apagadas.has(pagina.ref)) continue
    const xobjetos = xobjetosDosRecursos(
      context,
      pagina.node.getInheritableAttribute(PDFName.Resources),
    )
    if (!xobjetos) continue
    const uso = usos.get(xobjetos) ?? {
      usados: new Set<PDFName>(),
      certo: true,
    }
    uso.certo &&= juntarUsados(
      context,
      bytesDoConteudo(context, pagina.node.get(PDFName.Contents)),
      xobjetos,
      uso.usados,
      new Set(),
    )
    usos.set(xobjetos, uso)
  }
  for (const no of nosDaArvoreDePaginas(documento)) {
    const xobjetos = xobjetosDosRecursos(context, no.get(PDFName.Resources))
    if (xobjetos && !usos.has(xobjetos)) {
      usos.set(xobjetos, { usados: new Set(), certo: true })
    }
  }
  for (const [xobjetos, { usados, certo }] of usos) {
    if (!certo) continue
    for (const [nome, valor] of xobjetos.entries()) {
      if (
        valor instanceof PDFRef &&
        candidatos.has(valor) &&
        !usados.has(nome)
      ) {
        xobjetos.delete(nome)
      }
    }
  }
}

function dicionario(
  contexto: PDFContext,
  valor: PDFObject | undefined,
): PDFDict | undefined {
  const alvo = contexto.lookup(valor)
  return alvo instanceof PDFDict ? alvo : undefined
}

// Um elemento sem /Pg (seção, capítulo) descreve a página apagada quando tudo o que está abaixo dele
// está nela: perde os mesmos textos que o elemento da página.
function limparEstruturaDasApagadas(
  documento: PDFDocument,
  apagadas: Set<PDFRef>,
): void {
  const { context } = documento
  const raiz = dicionario(
    context,
    documento.catalog.get(PDFName.of('StructTreeRoot')),
  )
  if (!raiz) return
  const conhecidas = new Map<PDFDict, Set<PDFRef | null>>()
  const emCurso = new Set<PDFDict>()
  const paginasDe = (
    valor: PDFObject | undefined,
    herdada: PDFRef | null,
  ): Set<PDFRef | null> => {
    const alvo = context.lookup(valor)
    if (alvo instanceof PDFNumber) return new Set([herdada])
    if (alvo instanceof PDFArray) {
      const todas = new Set<PDFRef | null>()
      for (const item of alvo.asArray()) {
        for (const pagina of paginasDe(item, herdada)) todas.add(pagina)
      }
      return todas
    }
    if (!(alvo instanceof PDFDict)) return new Set()
    const propria = alvo.get(PDFName.of('Pg'))
    const pagina = propria instanceof PDFRef ? propria : herdada
    const tipo = alvo.get(PDFName.Type)
    if (tipo === PDFName.of('MCR') || tipo === PDFName.of('OBJR')) {
      return new Set([pagina])
    }
    const jaVistas = conhecidas.get(alvo)
    if (jaVistas) return jaVistas
    if (emCurso.has(alvo)) return new Set()
    emCurso.add(alvo)
    const paginas = new Set(paginasDe(alvo.get(PDFName.of('K')), pagina))
    if (propria instanceof PDFRef) paginas.add(propria)
    emCurso.delete(alvo)
    conhecidas.set(alvo, paginas)
    if (
      paginas.size > 0 &&
      [...paginas].every((p) => p !== null && apagadas.has(p))
    ) {
      for (const chave of TEXTOS_DA_ESTRUTURA) alvo.delete(chave)
    }
    return paginas
  }
  paginasDe(raiz.get(PDFName.of('K')), null)
}

// Os destinos nomeados, do /Dests antigo do catálogo e da árvore de nomes.
function destinosNomeados(documento: PDFDocument): Map<string, PDFObject> {
  const { context } = documento
  const nomeados = new Map<string, PDFObject>()
  const antigos = dicionario(
    context,
    documento.catalog.get(PDFName.of('Dests')),
  )
  for (const [nome, valor] of antigos?.entries() ?? []) {
    nomeados.set(nome.decodeText(), valor)
  }
  const nomes = dicionario(context, documento.catalog.get(PDFName.of('Names')))
  const pilha: (PDFObject | undefined)[] = [nomes?.get(PDFName.of('Dests'))]
  const vistos = new Set<PDFDict>()
  while (pilha.length > 0) {
    const no = dicionario(context, pilha.pop())
    if (!no || vistos.has(no)) continue
    vistos.add(no)
    const folhas = context.lookup(no.get(PDFName.of('Names')))
    if (folhas instanceof PDFArray) {
      for (let i = 0; i + 1 < folhas.size(); i += 2) {
        const chave = folhas.get(i)
        if (chave instanceof PDFString || chave instanceof PDFHexString) {
          nomeados.set(chave.decodeText(), folhas.get(i + 1))
        }
      }
    }
    const filhos = context.lookup(no.get(PDFName.of('Kids')))
    if (filhos instanceof PDFArray) pilha.push(...filhos.asArray())
  }
  return nomeados
}

function paginaDoDestino(
  contexto: PDFContext,
  destino: PDFObject | undefined,
  nomeados: Map<string, PDFObject>,
  saltos = 0,
): PDFRef | undefined {
  const alvo = contexto.lookup(destino)
  if (alvo instanceof PDFArray) {
    const pagina = alvo.get(0)
    return pagina instanceof PDFRef ? pagina : undefined
  }
  if (saltos > 2) return undefined
  if (alvo instanceof PDFDict) {
    return paginaDoDestino(
      contexto,
      alvo.get(PDFName.of('D')),
      nomeados,
      saltos + 1,
    )
  }
  if (
    alvo instanceof PDFName ||
    alvo instanceof PDFString ||
    alvo instanceof PDFHexString
  ) {
    return paginaDoDestino(
      contexto,
      nomeados.get(alvo.decodeText()),
      nomeados,
      saltos + 1,
    )
  }
  return undefined
}

type Marcador = {
  ref: PDFRef
  item: PDFDict
  sai: boolean
  filhos: Marcador[]
}

// O título do marcador costuma resumir a página: o que leva a uma página apagada sai, e os filhos dele
// sobem para o lugar dele. O /Count de cada um é contado de novo, guardando aberto ou fechado.
function tirarMarcadoresDasApagadas(
  documento: PDFDocument,
  apagadas: Set<PDFRef>,
): void {
  const { context } = documento
  const referenciaDaRaiz = documento.catalog.get(PDFName.of('Outlines'))
  const raiz = dicionario(context, referenciaDaRaiz)
  if (!raiz || !referenciaDaRaiz) return
  const nomeados = destinosNomeados(documento)
  const vistos = new Set<PDFDict>()
  const montar = (pai: PDFDict): Marcador[] => {
    const marcadores: Marcador[] = []
    let ref = pai.get(PDFName.of('First'))
    while (ref instanceof PDFRef) {
      const item = dicionario(context, ref)
      if (!item || vistos.has(item)) break
      vistos.add(item)
      const acao = dicionario(context, item.get(PDFName.of('A')))
      const destino =
        item.get(PDFName.of('Dest')) ??
        (acao?.get(PDFName.of('S')) === PDFName.of('GoTo')
          ? acao.get(PDFName.of('D'))
          : undefined)
      const pagina = paginaDoDestino(context, destino, nomeados)
      marcadores.push({
        ref,
        item,
        sai: pagina !== undefined && apagadas.has(pagina),
        filhos: montar(item),
      })
      ref = item.get(PDFName.of('Next'))
    }
    return marcadores
  }
  const arvore = montar(raiz)
  const algumSai = (marcadores: Marcador[]): boolean =>
    marcadores.some(({ sai, filhos }) => sai || algumSai(filhos))
  if (!algumSai(arvore)) return
  const queFicam = (marcadores: Marcador[]): Marcador[] =>
    marcadores.flatMap((marcador) => {
      marcador.filhos = queFicam(marcador.filhos)
      return marcador.sai ? marcador.filhos : [marcador]
    })
  // Liga os marcadores como filhos de `pai` e devolve quantos aparecem com ele aberto.
  const ligar = (
    pai: PDFDict,
    referenciaDoPai: PDFObject,
    marcadores: Marcador[],
  ): number => {
    pai.delete(PDFName.of('First'))
    pai.delete(PDFName.of('Last'))
    if (marcadores.length > 0) {
      pai.set(PDFName.of('First'), marcadores[0].ref)
      pai.set(PDFName.of('Last'), marcadores[marcadores.length - 1].ref)
    }
    let visiveis = 0
    marcadores.forEach(({ ref, item, filhos }, i) => {
      item.set(PDFName.of('Parent'), referenciaDoPai)
      if (i > 0) item.set(PDFName.of('Prev'), marcadores[i - 1].ref)
      else item.delete(PDFName.of('Prev'))
      if (i < marcadores.length - 1) {
        item.set(PDFName.of('Next'), marcadores[i + 1].ref)
      } else {
        item.delete(PDFName.of('Next'))
      }
      const count = context.lookup(item.get(PDFName.of('Count')))
      const aberto = count instanceof PDFNumber && count.asNumber() > 0
      const deles = ligar(item, ref, filhos)
      if (deles === 0) item.delete(PDFName.of('Count'))
      else item.set(PDFName.of('Count'), PDFNumber.of(aberto ? deles : -deles))
      visiveis += 1 + (aberto ? deles : 0)
    })
    return visiveis
  }
  raiz.set(
    PDFName.of('Count'),
    PDFNumber.of(ligar(raiz, referenciaDaRaiz, queFicam(arvore))),
  )
}

export async function aplicarEdicoes(
  bytes: Uint8Array,
  edicoes: readonly EdicaoDaPagina[],
): Promise<Uint8Array> {
  conferirEdicoes(edicoes)
  const documento = await abrir(bytes)
  const paginas = documento.getPages()
  for (const { indice } of edicoes) {
    if (indice >= paginas.length) {
      throw new RangeError(
        `página fora do documento: ${indice} de ${paginas.length}`,
      )
    }
  }
  const recursos = new Recursos(documento)
  const apagadas = new Set<PDFRef>()
  const anotacoesRemovidas = new Set<PDFRef>()
  const xobjetosDasApagadas = new Set<PDFRef>()
  for (const { indice, objetos, fundo } of edicoes) {
    const pagina = paginas[indice]
    let geometria = geometriaDaPagina(pagina)
    if (fundo === undefined) {
      await desenharNaPagina(pagina, geometria, objetos, recursos, indice)
      continue
    }
    const imagem = await recursos.imagem(fundo, indice)
    const { largura, altura } = tamanhoNaTela(geometria)
    for (const referencia of referenciasDasAnotacoes(pagina)) {
      anotacoesRemovidas.add(referencia)
    }
    for (const valor of xobjetosDosRecursos(
      documento.context,
      pagina.node.getInheritableAttribute(PDFName.Resources),
    )?.values() ?? []) {
      if (valor instanceof PDFRef) xobjetosDasApagadas.add(valor)
    }
    esvaziarPagina(pagina, largura, altura)
    apagadas.add(pagina.ref)
    geometria = {
      caixa: { x: 0, y: 0, largura, altura },
      rotacao: 0,
      unidade: 1,
    }
    pagina.drawImage(imagem, { x: 0, y: 0, width: largura, height: altura })
    await desenharNaPagina(pagina, geometria, objetos, recursos, indice, true)
    pagina.node.delete(PDFName.Annots)
  }
  if (apagadas.size > 0) {
    soltarXObjectsDasApagadas(documento, xobjetosDasApagadas, apagadas)
    limparEstruturaDasApagadas(documento, apagadas)
    tirarMarcadoresDasApagadas(documento, apagadas)
    // O XFA guarda num XML o que foi digitado em todo o formulário; o AcroForm comum continua valendo.
    dicionario(
      documento.context,
      documento.catalog.get(PDFName.of('AcroForm')),
    )?.delete(PDFName.of('XFA'))
    documento.catalog.delete(PDFName.of('NeedsRendering'))
    let removidos = anotacoesRemovidas
    do {
      const mexidos = desligar(documento.context, removidos, apagadas)
      removidos = camposSemWidget(documento, mexidos)
    } while (removidos.size > 0)
  }
  await documento.flush()
  soltarInalcancaveis(documento.context)
  return documento.save({
    objectsPerTick: Infinity,
    updateFieldAppearances: false,
  })
}
