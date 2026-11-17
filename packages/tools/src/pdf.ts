import {
  BlendMode,
  LineCapStyle,
  PDFArray,
  PDFBool,
  PDFButton,
  PDFCheckBox,
  PDFContentStream,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFRadioGroup,
  PDFRawStream,
  PDFRef,
  PDFSignature,
  PDFStream,
  PDFString,
  PDFTextField,
  ParseSpeeds,
  StandardFonts,
  concatTransformationMatrix,
  decodePDFRawStream,
  defaultDropdownAppearanceProvider,
  defaultOptionListAppearanceProvider,
  degrees,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFField,
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
  cabeNoWinAnsi,
  caixaNaTela,
  caracteresForaDoWinAnsi,
  compararPelaOrdemDeTab,
  componentesDaCor,
  corValida,
  extremosDaLinha,
  geometriaDaSeta,
  giroNormalizado,
  linhasDeBase,
  matrizDaAparencia,
  matrizDaTelaParaPdf,
  tamanhoNaTela,
  tipoDaImagem,
  type CampoDoFormulario,
  type FamiliaDaFonte,
  type Formulario,
  type GeometriaDaPagina,
  type Matriz,
  type MotivoDeNaoPreencher,
  type MotivoDoErroDePdf,
  type MotivoDoErroNaEdicao,
  type MotivoDoErroNoCampo,
  type ObjetoDaPagina,
  type OrdemDeTab,
  type PaginaDoPlano,
  type PosicaoNaOrdemDeTab,
  type PreenchimentoDoFormulario,
  type Retangulo,
  type ValorDoCampo,
  type WidgetDoCampo,
} from './pdf-regras'
import { caminhoDoTraco } from './pdf-traco'

export type {
  CampoDoFormulario,
  Formulario,
  Giro,
  MotivoDeNaoPreencher,
  MotivoDoErroDePdf,
  MotivoDoErroNaEdicao,
  MotivoDoErroNoCampo,
  ObjetoDaPagina,
  PaginaDoPlano,
  PreenchimentoDoFormulario,
  ValorDoCampo,
  WidgetDoCampo,
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

// Um array de `quantos` números finitos (/Rect, /BBox, /Matrix), ou null.
function numerosDe(
  contexto: PDFContext,
  valor: PDFObject | undefined,
  quantos: number,
): number[] | null {
  const array = contexto.lookup(valor)
  if (!(array instanceof PDFArray) || array.size() !== quantos) return null
  const numeros = array
    .asArray()
    .map((item) => contexto.lookup(item))
    .map((item) => (item instanceof PDFNumber ? item.asNumber() : NaN))
  return numeros.every(Number.isFinite) ? numeros : null
}

function caixaDaPagina(pagina: PDFPage, nome: string): number[] | null {
  const numeros = numerosDe(
    pagina.doc.context,
    pagina.node.getInheritableAttribute(PDFName.of(nome)),
    4,
  )
  if (!numeros) return null
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

const ehNome = (
  valor: PDFObject | undefined,
): valor is PDFName | PDFString | PDFHexString =>
  valor instanceof PDFName ||
  valor instanceof PDFString ||
  valor instanceof PDFHexString

// O array do destino ([página /XYZ ...]), como está guardado: a referência a ele ou o próprio array.
function destinoExplicito(
  contexto: PDFContext,
  destino: PDFObject | undefined,
  nomeados: Map<string, PDFObject>,
  saltos = 0,
): PDFRef | PDFArray | undefined {
  const alvo = contexto.lookup(destino)
  if (alvo instanceof PDFArray) {
    return destino instanceof PDFRef ? destino : alvo
  }
  if (saltos > 2) return undefined
  if (alvo instanceof PDFDict) {
    return destinoExplicito(
      contexto,
      alvo.get(PDFName.of('D')),
      nomeados,
      saltos + 1,
    )
  }
  if (ehNome(alvo)) {
    return destinoExplicito(
      contexto,
      nomeados.get(alvo.decodeText()),
      nomeados,
      saltos + 1,
    )
  }
  return undefined
}

function paginaDoDestino(
  contexto: PDFContext,
  destino: PDFObject | undefined,
  nomeados: Map<string, PDFObject>,
): PDFRef | undefined {
  const array = contexto.lookup(destinoExplicito(contexto, destino, nomeados))
  const pagina = array instanceof PDFArray ? array.get(0) : undefined
  return pagina instanceof PDFRef ? pagina : undefined
}

type Saiu = (nome: string, valor: PDFObject | undefined) => boolean

// Tira da árvore os pares que `saiu` aponta e devolve os nomes que sobraram abaixo do nó, na ordem (só
// o primeiro e o último de cada filho, que é o que o /Limits usa), ou null quando o nó esvaziou.
function podarArvoreDeNomes(
  contexto: PDFContext,
  no: PDFDict,
  saiu: Saiu,
  emCurso: Set<PDFDict>,
): PDFObject[] | null {
  emCurso.add(no)
  const nomes: PDFObject[] = []
  const folhas = contexto.lookup(no.get(PDFName.of('Names')))
  if (folhas instanceof PDFArray) {
    for (let i = folhas.size() - (folhas.size() % 2) - 2; i >= 0; i -= 2) {
      const chave = folhas.get(i)
      if (ehNome(chave) && saiu(chave.decodeText(), folhas.get(i + 1))) {
        folhas.remove(i + 1)
        folhas.remove(i)
      }
    }
    for (let i = 0; i + 1 < folhas.size(); i += 2) nomes.push(folhas.get(i))
  }
  const filhos = contexto.lookup(no.get(PDFName.of('Kids')))
  let ficaramFilhos = false
  if (filhos instanceof PDFArray) {
    const dosFilhos: PDFObject[][] = []
    for (let i = filhos.size() - 1; i >= 0; i--) {
      const filho = dicionario(contexto, filhos.get(i))
      if (!filho || emCurso.has(filho)) continue
      const deles = podarArvoreDeNomes(contexto, filho, saiu, emCurso)
      if (deles) dosFilhos.unshift(deles)
      else filhos.remove(i)
    }
    ficaramFilhos = filhos.size() > 0
    for (const deles of dosFilhos) {
      if (deles.length > 0) nomes.push(deles[0], deles[deles.length - 1])
    }
  }
  emCurso.delete(no)
  if (nomes.length === 0 && !ficaramFilhos) return null
  if (nomes.length > 0 && no.has(PDFName.of('Limits'))) {
    no.set(
      PDFName.of('Limits'),
      contexto.obj([nomes[0], nomes[nomes.length - 1]]),
    )
  }
  return nomes
}

// Um nome como CPF_123 diz o que a página guardava: o nome que leva a uma página apagada sai do /Dests
// antigo e da árvore de nomes, e quem o usava (link, marcador, ação GoTo) passa ao destino explícito.
function tirarDestinosDasApagadas(
  documento: PDFDocument,
  apagadas: Set<PDFRef>,
): void {
  const { context, catalog } = documento
  const nomeados = destinosNomeados(documento)
  const removidos = new Map<string, PDFObject | undefined>()
  const saiu: Saiu = (nome, valor) => {
    const pagina = paginaDoDestino(context, valor, nomeados)
    if (pagina === undefined || !apagadas.has(pagina)) return false
    removidos.set(nome, destinoExplicito(context, valor, nomeados))
    return true
  }
  const antigos = dicionario(context, catalog.get(PDFName.of('Dests')))
  if (antigos) {
    for (const [nome, valor] of antigos.entries()) {
      if (saiu(nome.decodeText(), valor)) antigos.delete(nome)
    }
    if (antigos.keys().length === 0) catalog.delete(PDFName.of('Dests'))
  }
  const nomes = dicionario(context, catalog.get(PDFName.of('Names')))
  const raiz = dicionario(context, nomes?.get(PDFName.of('Dests')))
  if (nomes && raiz && !podarArvoreDeNomes(context, raiz, saiu, new Set())) {
    nomes.delete(PDFName.of('Dests'))
    if (nomes.keys().length === 0) catalog.delete(PDFName.of('Names'))
  }
  for (const nome of destinosNomeados(documento).keys()) removidos.delete(nome)
  if (removidos.size === 0) return
  const explicito = (valor: PDFObject | undefined) => {
    const alvo = context.lookup(valor)
    return ehNome(alvo) ? removidos.get(alvo.decodeText()) : undefined
  }
  percorrer(context, (objeto) => {
    if (!(objeto instanceof PDFDict)) return
    const destino = explicito(objeto.get(PDFName.of('Dest')))
    if (destino) objeto.set(PDFName.of('Dest'), destino)
    if (objeto.get(PDFName.of('S')) !== PDFName.of('GoTo')) return
    const daAcao = explicito(objeto.get(PDFName.of('D')))
    if (daAcao) objeto.set(PDFName.of('D'), daAcao)
  })
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

export class ErroNoCampo extends Error {
  readonly motivo: MotivoDoErroNoCampo
  readonly campo: number
  readonly nome: string
  readonly caracteres: readonly string[]

  constructor(
    motivo: MotivoDoErroNoCampo,
    campo: number,
    nome: string,
    caracteres: readonly string[] = [],
  ) {
    super(
      `${motivo} (campo ${campo}, ${nome})${caracteres.length ? `: ${caracteres.join(' ')}` : ''}`,
    )
    this.name = 'ErroNoCampo'
    this.motivo = motivo
    this.campo = campo
    this.nome = nome
    this.caracteres = caracteres
  }
}

const ACROFORM = PDFName.of('AcroForm')
const XFA = PDFName.of('XFA')
const ESCONDIDO = 1 << 1
const SEM_VISTA = 1 << 5

type LugarDoWidget = { pagina: number; anotacao: number }

// A chave é o dicionário, que o pdf-lib devolve igual pela referência do /Annots e pelos /Kids do campo.
function lugaresDasAnotacoes(
  documento: PDFDocument,
): Map<PDFDict, LugarDoWidget> {
  const { context } = documento
  const lugares = new Map<PDFDict, LugarDoWidget>()
  documento.getPages().forEach((pagina, indice) => {
    const anotacoes = context.lookup(pagina.node.get(PDFName.Annots))
    if (!(anotacoes instanceof PDFArray)) return
    anotacoes.asArray().forEach((item, anotacao) => {
      const dict = context.lookup(item)
      if (dict instanceof PDFDict && !lugares.has(dict)) {
        lugares.set(dict, { pagina: indice, anotacao })
      }
    })
  })
  return lugares
}

function escondido(contexto: PDFContext, widget: PDFDict): boolean {
  const bandeiras = contexto.lookup(widget.get(PDFName.of('F')))
  return (
    bandeiras instanceof PDFNumber &&
    (bandeiras.asNumber() & (ESCONDIDO | SEM_VISTA)) !== 0
  )
}

function ordemDeTab(pagina: PDFPage): OrdemDeTab {
  const tabs = pagina.doc.context.lookup(pagina.node.get(PDFName.of('Tabs')))
  if (tabs === PDFName.of('R')) return 'linhas'
  if (tabs === PDFName.of('C')) return 'colunas'
  return 'anotacoes'
}

function motivoDeNaoPreencher(
  campo: PDFField,
): MotivoDeNaoPreencher | undefined {
  if (campo instanceof PDFSignature) return 'assinatura_digital'
  if (campo instanceof PDFButton) return 'botao'
  if (campo.isReadOnly()) return 'somente_leitura'
  if (campo instanceof PDFTextField && campo.isFileSelector()) {
    return 'seletor_de_arquivo'
  }
  // A aparência da lista e da suspensa escreve as opções com a Helvetica.
  if (
    (campo instanceof PDFDropdown || campo instanceof PDFOptionList) &&
    !campo.getOptions().every(cabeNoWinAnsi)
  ) {
    return 'fora_do_winansi'
  }
  return undefined
}

function rotuloDe(campo: PDFField, nome: string): string {
  const rotulo = campo.acroField.dict.lookup(PDFName.of('TU'))
  const texto =
    rotulo instanceof PDFString || rotulo instanceof PDFHexString
      ? rotulo.decodeText().trim()
      : ''
  return texto || nome
}

function textoDe(campo: PDFTextField): string {
  try {
    return campo.getText() ?? ''
  } catch {
    // Com a bandeira RichText e sem /V, o getText do pdf-lib lança.
    return ''
  }
}

type WidgetLido = WidgetDoCampo & PosicaoNaOrdemDeTab

type LeituraDosWidgets = {
  lugares: Map<PDFDict, LugarDoWidget>
  paginas: PDFPage[]
  geometrias: Map<number, GeometriaDaPagina>
  ordens: Map<number, OrdemDeTab>
}

const compararWidgets =
  (leitura: LeituraDosWidgets) => (a: WidgetLido, b: WidgetLido) =>
    a.pagina - b.pagina ||
    compararPelaOrdemDeTab(leitura.ordens.get(a.pagina)!)(a, b)

function widgetsDoCampo(
  campo: PDFField,
  leitura: LeituraDosWidgets,
): WidgetLido[] {
  const { context } = campo.doc
  const exportacao =
    campo instanceof PDFRadioGroup
      ? campo.acroField.getExportValues()
      : undefined
  let ligados = 0
  const widgets: WidgetLido[] = []
  for (const widget of campo.acroField.getWidgets()) {
    const ligado =
      campo instanceof PDFRadioGroup || campo instanceof PDFCheckBox
        ? widget.getOnValue()
        : undefined
    // Como o getSelected do pdf-lib: a opção é o valor de exportação na posição do widget entre os que ligam.
    const opcao =
      ligado && (exportacao?.[ligados++]?.decodeText() ?? ligado.decodeText())
    const lugar = leitura.lugares.get(widget.dict)
    const retangulo = numerosDe(context, widget.dict.get(PDFName.of('Rect')), 4)
    if (!lugar || !retangulo || escondido(context, widget.dict)) continue
    let geometria = leitura.geometrias.get(lugar.pagina)
    if (!geometria) {
      const pagina = leitura.paginas[lugar.pagina]
      geometria = geometriaDaPagina(pagina)
      leitura.geometrias.set(lugar.pagina, geometria)
      leitura.ordens.set(lugar.pagina, ordemDeTab(pagina))
    }
    widgets.push({
      pagina: lugar.pagina,
      caixa: caixaNaTela(geometria, retangulo as unknown as Retangulo),
      anotacao: lugar.anotacao,
      ...(opcao ? { opcao } : {}),
    })
  }
  return widgets.sort(compararWidgets(leitura))
}

type CampoDeEscolha = PDFDropdown | PDFOptionList

function opcoesDeEscolha(
  campo: CampoDeEscolha,
): { exportacao: string; texto: string }[] {
  return campo.acroField.getOptions().map(({ value, display }) => ({
    exportacao: value.decodeText(),
    texto: (display ?? value).decodeText(),
  }))
}

// O /V guarda a exportação da opção (o pdf-lib lê e grava o texto). O que não é exportação de nenhuma fica
// como está: o texto que o pdf-lib gravou ou o valor que não está nas opções.
function textosEscolhidos(campo: CampoDeEscolha): string[] {
  const opcoes = opcoesDeEscolha(campo)
  return campo.acroField.getValues().map((valor) => {
    const lido = valor.decodeText()
    return opcoes.find(({ exportacao }) => exportacao === lido)?.texto ?? lido
  })
}

// Caixas com o mesmo nome e um valor de ligar em cada widget se excluem (Sim/Não, M/F, como a ajuda do
// Acrobat ensina): o check() do pdf-lib só conhece o do primeiro widget.
function ligadosDaCaixa(campo: PDFCheckBox): PDFName[] {
  const ligados: PDFName[] = []
  for (const widget of campo.acroField.getWidgets()) {
    const ligado = widget.getOnValue()
    if (ligado && !ligados.includes(ligado)) ligados.push(ligado)
  }
  return ligados
}

const ehGrupoDeCaixas = (campo: PDFCheckBox): boolean =>
  ligadosDaCaixa(campo).length > 1

function lerCampo(
  campo: PDFField,
  id: number,
  widgets: readonly WidgetDoCampo[],
): CampoDoFormulario {
  const nome = campo.getName()
  const naoPreenchivel = motivoDeNaoPreencher(campo)
  const base = {
    id,
    nome,
    rotulo: rotuloDe(campo, nome),
    obrigatorio: campo.isRequired(),
    widgets,
    ...(naoPreenchivel ? { naoPreenchivel } : {}),
  }
  if (campo instanceof PDFTextField) {
    return {
      ...base,
      tipo: 'texto',
      valor: textoDe(campo),
      multilinha: campo.isMultiline(),
      tamanhoMaximo: campo.getMaxLength() ?? null,
    }
  }
  if (campo instanceof PDFCheckBox && ehGrupoDeCaixas(campo)) {
    const valor = campo.acroField.getValue()
    return {
      ...base,
      tipo: 'opcoes',
      valor: valor === PDFName.of('Off') ? null : valor.decodeText(),
      opcoes: ligadosDaCaixa(campo).map((ligado) => ligado.decodeText()),
    }
  }
  if (campo instanceof PDFCheckBox) {
    return { ...base, tipo: 'caixa', marcada: campo.isChecked() }
  }
  if (campo instanceof PDFRadioGroup) {
    return {
      ...base,
      tipo: 'opcoes',
      valor: campo.getSelected() ?? null,
      opcoes: campo.getOptions(),
    }
  }
  if (campo instanceof PDFDropdown) {
    return {
      ...base,
      tipo: 'suspensa',
      valor: textosEscolhidos(campo)[0] ?? null,
      opcoes: opcoesDeEscolha(campo).map(({ texto }) => texto),
    }
  }
  if (campo instanceof PDFOptionList) {
    return {
      ...base,
      tipo: 'lista',
      valores: textosEscolhidos(campo),
      opcoes: opcoesDeEscolha(campo).map(({ texto }) => texto),
      multipla: campo.isMultiselect(),
    }
  }
  if (campo instanceof PDFSignature) {
    return {
      ...base,
      tipo: 'assinatura',
      assinada: campo.acroField.V() instanceof PDFDict,
    }
  }
  return { ...base, tipo: 'botao' }
}

function lerCampos(documento: PDFDocument): CampoDoFormulario[] {
  const leitura: LeituraDosWidgets = {
    lugares: lugaresDasAnotacoes(documento),
    paginas: documento.getPages(),
    geometrias: new Map(),
    ordens: new Map(),
  }
  const lidos = documento
    .getForm()
    .getFields()
    .map((campo, id) => {
      const widgets = widgetsDoCampo(campo, leitura)
      return {
        primeiro: widgets[0] as WidgetLido | undefined,
        campo: lerCampo(
          campo,
          id,
          widgets.map(({ pagina, caixa, opcao }) =>
            opcao === undefined ? { pagina, caixa } : { pagina, caixa, opcao },
          ),
        ),
      }
    })
  const comparar = compararWidgets(leitura)
  return lidos
    .sort((a, b) => {
      if (!a.primeiro || !b.primeiro) {
        return (
          Number(!a.primeiro) - Number(!b.primeiro) || a.campo.id - b.campo.id
        )
      }
      return comparar(a.primeiro, b.primeiro) || a.campo.id - b.campo.id
    })
    .map(({ campo }) => campo)
}

// O getForm() do pdf-lib 1.17.1 tira o /XFA (avisando no console) e cria um /AcroForm vazio quando falta:
// o dicionário cru é conferido antes, e o /XFA sai só desta cópia, que não é salva.
export async function lerFormulario(
  bytes: Uint8Array,
): Promise<{ paginas: number; formulario: Formulario }> {
  const documento = await abrir(bytes)
  const paginas = documento.getPageCount()
  const acroForm = dicionario(
    documento.context,
    documento.catalog.get(ACROFORM),
  )
  if (!acroForm) return { paginas, formulario: { tipo: 'nenhum' } }
  const hibrido = acroForm.has(XFA)
  acroForm.delete(XFA)
  let campos: CampoDoFormulario[]
  try {
    campos = lerCampos(documento)
  } catch {
    return { paginas, formulario: { tipo: 'ilegivel' } }
  }
  if (campos.length === 0) {
    return { paginas, formulario: { tipo: hibrido ? 'xfa' : 'nenhum' } }
  }
  return {
    paginas,
    formulario: {
      tipo: 'acroform',
      hibrido,
      assinadoDigitalmente: campos.some(
        (campo) => campo.tipo === 'assinatura' && campo.assinada,
      ),
      campos,
    },
  }
}

// O preenchimento chega ao Worker por postMessage, como os objetos.
function conferirPreenchimento(
  formulario: PreenchimentoDoFormulario | undefined,
  edicoes: readonly EdicaoDaPagina[],
): void {
  if (formulario === undefined) return
  const falhar = (campo: string): never => {
    throw new RangeError(`preenchimento inválido: ${campo}`)
  }
  if (typeof formulario !== 'object' || formulario === null) falhar('objeto')
  if (typeof formulario.achatar !== 'boolean') falhar('achatar')
  if (!Array.isArray(formulario.valores)) falhar('valores')
  // A tela nunca manda os dois, e o apagar de verdade tiraria os campos da página.
  if (edicoes.some(({ fundo }) => fundo !== undefined)) {
    falhar('formulário junto com apagar de verdade')
  }
  const ids = new Set<number>()
  for (const valor of formulario.valores as readonly ValorDoCampo[]) {
    if (typeof valor !== 'object' || valor === null) falhar('valor')
    if (!Number.isInteger(valor.id) || valor.id < 0) falhar(`id ${valor.id}`)
    if (ids.has(valor.id)) falhar(`campo repetido ${valor.id}`)
    ids.add(valor.id)
    if (typeof valor.nome !== 'string') falhar(`nome do campo ${valor.id}`)
    switch (valor.tipo) {
      case 'texto': {
        if (typeof valor.valor !== 'string')
          falhar(`texto do campo ${valor.id}`)
        const fora = caracteresForaDoWinAnsi(valor.valor)
        if (fora.length) {
          throw new ErroNoCampo(
            'texto_fora_do_winansi',
            valor.id,
            valor.nome,
            fora,
          )
        }
        break
      }
      case 'caixa':
        if (typeof valor.marcada !== 'boolean') falhar(`campo ${valor.id}`)
        break
      case 'opcoes':
      case 'suspensa':
        if (valor.valor !== null && typeof valor.valor !== 'string') {
          falhar(`opção do campo ${valor.id}`)
        }
        break
      case 'lista':
        if (
          !Array.isArray(valor.valores) ||
          !valor.valores.every((opcao) => typeof opcao === 'string') ||
          new Set(valor.valores).size !== valor.valores.length
        ) {
          falhar(`opções do campo ${valor.id}`)
        }
        break
      default:
        falhar(`tipo do campo ${(valor as ValorDoCampo).id}`)
    }
  }
}

function exigirOpcoes(
  opcoes: readonly string[],
  escolhidas: readonly string[],
  id: number,
): void {
  for (const escolhida of escolhidas) {
    if (!opcoes.includes(escolhida)) {
      throw new RangeError(`opção que o campo ${id} não tem: ${escolhida}`)
    }
  }
}

function marcarNoGrupoDeCaixas(
  campo: PDFCheckBox,
  opcao: string | null,
  id: number,
): void {
  const escolhido =
    opcao === null
      ? PDFName.of('Off')
      : ligadosDaCaixa(campo).find((ligado) => ligado.decodeText() === opcao)
  if (!escolhido) {
    throw new RangeError(`opção que o campo ${id} não tem: ${opcao}`)
  }
  campo.acroField.dict.set(PDFName.of('V'), escolhido)
  for (const widget of campo.acroField.getWidgets()) {
    widget.setAppearanceState(
      widget.getOnValue() === escolhido ? escolhido : PDFName.of('Off'),
    )
  }
}

// Grava a exportação no /V (o select do pdf-lib gravaria o texto), e o /I da lista múltipla. O valor do
// arquivo que não está nas opções é aceito como veio: a tela o mostra como mais uma opção.
function escolherOpcoes(
  campo: CampoDeEscolha,
  textos: readonly string[],
  id: number,
): void {
  const opcoes = opcoesDeEscolha(campo)
  const doArquivo = textosEscolhidos(campo)
  const indices: number[] = []
  const valores = textos.map((texto) => {
    const indice = opcoes.findIndex((opcao) => opcao.texto === texto)
    if (indice >= 0) {
      indices.push(indice)
      return PDFHexString.fromText(opcoes[indice].exportacao)
    }
    if (doArquivo.includes(texto)) return PDFHexString.fromText(texto)
    throw new RangeError(`opção que o campo ${id} não tem: ${texto}`)
  })
  const { dict } = campo.acroField
  if (valores.length === 0) dict.delete(PDFName.of('V'))
  else if (valores.length === 1) dict.set(PDFName.of('V'), valores[0])
  else dict.set(PDFName.of('V'), dict.context.obj(valores))
  const multipla = campo instanceof PDFOptionList && campo.isMultiselect()
  if (multipla && indices.length > 0 && indices.length === valores.length) {
    dict.set(PDFName.of('I'), dict.context.obj(indices.sort((a, b) => a - b)))
  } else {
    dict.delete(PDFName.of('I'))
  }
}

function escreverValor(campo: PDFField, valor: ValorDoCampo): void {
  const { id, nome } = valor
  if (valor.tipo === 'texto' && campo instanceof PDFTextField) {
    const maximo = campo.getMaxLength()
    if (maximo !== undefined && valor.valor.length > maximo) {
      throw new ErroNoCampo('acima_do_tamanho_maximo', id, nome)
    }
    campo.setText(valor.valor)
  } else if (
    valor.tipo === 'opcoes' &&
    campo instanceof PDFCheckBox &&
    ehGrupoDeCaixas(campo)
  ) {
    marcarNoGrupoDeCaixas(campo, valor.valor, id)
  } else if (
    valor.tipo === 'caixa' &&
    campo instanceof PDFCheckBox &&
    !ehGrupoDeCaixas(campo)
  ) {
    if (valor.marcada) campo.check()
    else campo.uncheck()
  } else if (valor.tipo === 'opcoes' && campo instanceof PDFRadioGroup) {
    if (valor.valor === null) {
      campo.clear()
    } else {
      exigirOpcoes(campo.getOptions(), [valor.valor], id)
      campo.select(valor.valor)
    }
  } else if (valor.tipo === 'suspensa' && campo instanceof PDFDropdown) {
    escolherOpcoes(campo, valor.valor === null ? [] : [valor.valor], id)
  } else if (valor.tipo === 'lista' && campo instanceof PDFOptionList) {
    if (valor.valores.length > 1 && !campo.isMultiselect()) {
      throw new RangeError(`o campo ${id} aceita uma opção só`)
    }
    escolherOpcoes(campo, valor.valores, id)
  } else {
    throw new RangeError(`o campo ${id} não é do tipo ${valor.tipo}`)
  }
}

// A caixa de marcar e os botões de opção já têm a aparência de cada estado: o valor novo só troca o /AS,
// e a aparência que o arquivo tem fica. Só ganham uma nova quando falta a do estado. Devolve se usou a fonte.
function atualizarAparencia(campo: PDFField, fonte: () => PDFFont): boolean {
  if (campo instanceof PDFCheckBox || campo instanceof PDFRadioGroup) {
    if (campo.needsAppearancesUpdate()) campo.updateAppearances()
    return false
  }
  if (campo instanceof PDFDropdown) {
    campo.updateAppearances(fonte(), (c, widget, f) =>
      defaultDropdownAppearanceProvider(comOsTextos(c), widget, f),
    )
    return true
  }
  if (campo instanceof PDFOptionList) {
    campo.updateAppearances(fonte(), (c, widget, f) =>
      defaultOptionListAppearanceProvider(comOsTextos(c), widget, f),
    )
    return true
  }
  if (campo instanceof PDFTextField || campo instanceof PDFButton) {
    campo.updateAppearances(fonte())
    return true
  }
  return false
}

// A aparência padrão do pdf-lib escreve o /V cru, que é a exportação: a página tem que mostrar o texto.
function comOsTextos<T extends CampoDeEscolha>(campo: T): T {
  return Object.assign(Object.create(campo) as T, {
    getSelected: () => textosEscolhidos(campo),
  })
}

// O /DA novo do campo pede a fonte pelo nome: sem ela no /DR, o leitor que refaz a aparência não a acha.
function registrarFonteNoFormulario(acroForm: PDFDict, fonte: PDFFont): void {
  const { context } = acroForm
  let recursos = dicionario(context, acroForm.get(PDFName.of('DR')))
  if (!recursos) {
    recursos = context.obj({})
    acroForm.set(PDFName.of('DR'), recursos)
  }
  let fontes = dicionario(context, recursos.get(PDFName.Font))
  if (!fontes) {
    fontes = context.obj({})
    recursos.set(PDFName.Font, fontes)
  }
  const nome = PDFName.of(fonte.name)
  if (!fontes.has(nome)) fontes.set(nome, fonte.ref)
}

function preencherFormulario(
  documento: PDFDocument,
  { valores, achatar }: PreenchimentoDoFormulario,
  recursos: Recursos,
): void {
  if (valores.length === 0 && !achatar) return
  const acroForm = dicionario(
    documento.context,
    documento.catalog.get(ACROFORM),
  )
  if (!acroForm) {
    if (valores.length > 0) throw new RangeError('o PDF não tem formulário')
    return
  }
  // O Acrobat mostraria os valores antigos guardados no XFA.
  acroForm.delete(XFA)
  documento.catalog.delete(PDFName.of('NeedsRendering'))
  const campos = documento.getForm().getFields()
  const fonte = () => recursos.fonte('helvetica', false, false)
  let usouFonte = false
  for (const valor of valores) {
    const campo = campos[valor.id]
    if (!campo) throw new RangeError(`campo fora do formulário: ${valor.id}`)
    if (campo.getName() !== valor.nome) {
      throw new RangeError(`o campo ${valor.id} não se chama ${valor.nome}`)
    }
    const motivo = motivoDeNaoPreencher(campo)
    if (motivo) {
      throw new RangeError(`o campo ${valor.id} não se preenche (${motivo})`)
    }
    escreverValor(campo, valor)
    try {
      usouFonte = atualizarAparencia(campo, fonte) || usouFonte
    } catch {
      throw new ErroNoCampo('aparencia_do_campo', valor.id, valor.nome)
    }
  }
  if (usouFonte) registrarFonteNoFormulario(acroForm, fonte())
  if (achatar) achatarFormulario(documento, campos, fonte)
}

function desenharAparencia(pagina: PDFPage, widget: PDFDict): void {
  const { context } = pagina.doc
  const aparencias = dicionario(context, widget.get(PDFName.of('AP')))
  let normal = aparencias?.get(PDFName.of('N'))
  let alvo = context.lookup(normal)
  if (alvo instanceof PDFDict) {
    // Caixa de marcar e botão de opção: uma aparência por estado, e o /AS diz qual está ligada.
    const estado = context.lookup(widget.get(PDFName.of('AS')))
    normal = estado instanceof PDFName ? alvo.get(estado) : undefined
    alvo = context.lookup(normal)
  }
  if (!(alvo instanceof PDFStream)) return
  const retangulo = numerosDe(context, widget.get(PDFName.of('Rect')), 4)
  const bbox = numerosDe(context, alvo.dict.get(PDFName.of('BBox')), 4)
  const matriz = (numerosDe(
    context,
    alvo.dict.get(PDFName.of('Matrix')),
    6,
  ) ?? [1, 0, 0, 1, 0, 0]) as unknown as Matriz
  if (!retangulo || !bbox) return
  const final = matrizDaAparencia(
    retangulo as unknown as Retangulo,
    bbox,
    matriz,
  )
  if (!final) return
  alvo.dict.set(PDFName.Type, PDFName.of('XObject'))
  alvo.dict.set(PDFName.of('Subtype'), PDFName.of('Form'))
  const nome = pagina.node.newXObject(
    'Campo',
    normal instanceof PDFRef ? normal : context.register(alvo),
  )
  pagina.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(...final),
    drawObject(nome),
    popGraphicsState(),
  )
}

// Sem o flatten() do pdf-lib 1.17.1: ele lança com widget sem aparência, ignora a /BBox e deixa o widget
// no /Annots (ver "Achatar" no packages/tools/CLAUDE.md).
function achatarFormulario(
  documento: PDFDocument,
  campos: readonly PDFField[],
  fonte: () => PDFFont,
): void {
  const { context, catalog } = documento
  const lugares = lugaresDasAnotacoes(documento)
  const paginas = documento.getPages()
  const pedeAparencias =
    dicionario(context, catalog.get(ACROFORM))?.lookup(
      PDFName.of('NeedAppearances'),
    ) === PDFBool.True
  let removidos = new Set<PDFRef>()
  campos.forEach((campo, id) => {
    if (campo instanceof PDFSignature) return
    // Com o /NeedAppearances, a aparência guardada pode estar velha: o leitor a refaz ao abrir, e a tela
    // mostra o /V. Achatar com ela apagaria o valor.
    const escreveTexto =
      campo instanceof PDFTextField ||
      campo instanceof PDFDropdown ||
      campo instanceof PDFOptionList
    try {
      if ((pedeAparencias && escreveTexto) || campo.needsAppearancesUpdate()) {
        atualizarAparencia(campo, fonte)
      }
    } catch {
      throw new ErroNoCampo('aparencia_do_campo', id, campo.getName())
    }
    const filhos = campo.acroField.Kids()
    for (const item of filhos ? filhos.asArray() : [campo.ref]) {
      const widget = context.lookup(item)
      if (item instanceof PDFRef) removidos.add(item)
      if (!(widget instanceof PDFDict) || escondido(context, widget)) continue
      const lugar = lugares.get(widget)
      if (lugar) desenharAparencia(paginas[lugar.pagina], widget)
    }
  })
  do {
    const mexidos = desligar(context, removidos, new Set())
    removidos = camposSemWidget(documento, mexidos)
  } while (removidos.size > 0)
  const acroForm = dicionario(context, catalog.get(ACROFORM))
  const restantes = acroForm?.lookupMaybe(PDFName.of('Fields'), PDFArray)
  if (!restantes || restantes.size() === 0) catalog.delete(ACROFORM)
  else acroForm?.delete(PDFName.of('NeedAppearances'))
}

// Os recursos estendidos do Reader (/UR3, comuns em formulário de governo) são uma assinatura do arquivo
// inteiro, que deixa de valer quando o pdf-lib o escreve de novo, e o Reader passaria a acusar o arquivo.
function tirarRecursosEstendidos({ context, catalog }: PDFDocument): void {
  const permissoes = dicionario(context, catalog.get(PDFName.of('Perms')))
  if (!permissoes) return
  permissoes.delete(PDFName.of('UR3'))
  permissoes.delete(PDFName.of('UR'))
  if (permissoes.keys().length === 0) catalog.delete(PDFName.of('Perms'))
}

export async function aplicarEdicoes(
  bytes: Uint8Array,
  edicoes: readonly EdicaoDaPagina[],
  formulario?: PreenchimentoDoFormulario,
): Promise<Uint8Array> {
  conferirEdicoes(edicoes)
  conferirPreenchimento(formulario, edicoes)
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
  // A assinatura fica por cima do campo achatado.
  if (formulario) preencherFormulario(documento, formulario, recursos)
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
    tirarDestinosDasApagadas(documento, apagadas)
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
  tirarRecursosEstendidos(documento)
  await documento.flush()
  soltarInalcancaveis(documento.context)
  return documento.save({
    objectsPerTick: Infinity,
    updateFieldAppearances: false,
  })
}
