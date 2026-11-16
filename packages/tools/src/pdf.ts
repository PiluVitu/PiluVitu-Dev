import {
  PDFDocument,
  PDFName,
  ParseSpeeds,
  degrees,
  type PDFPage,
} from 'pdf-lib'
import {
  GIROS,
  giroNormalizado,
  type MotivoDoErroDePdf,
  type PaginaDoPlano,
} from './pdf-regras'

export type { Giro, MotivoDoErroDePdf, PaginaDoPlano } from './pdf-regras'

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
