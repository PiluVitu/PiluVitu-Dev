export type ImagemDoIco = { largura: number; altura: number; png: Uint8Array }

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR = [0x49, 0x48, 0x44, 0x52]
const CABECALHO = 6
const ENTRADA = 16
const LADO_MAXIMO = 256

function comeca(bytes: Uint8Array, esperado: number[], em = 0): boolean {
  return esperado.every((byte, i) => bytes[em + i] === byte)
}

function visao(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function ladosDoPng(png: Uint8Array): { largura: number; altura: number } {
  if (png.length < 24 || !comeca(png, ASSINATURA_PNG) || !comeca(png, IHDR, 12))
    throw new Error('O arquivo não é PNG.')
  const dados = visao(png)
  const lados = { largura: dados.getUint32(16), altura: dados.getUint32(20) }
  for (const lado of Object.values(lados))
    if (lado < 1 || lado > LADO_MAXIMO)
      throw new Error('O ICO aceita lados de 1 até 256 px.')
  return lados
}

export function icoDePngs(
  pngs: readonly Uint8Array[],
): Uint8Array<ArrayBuffer> {
  if (pngs.length === 0) throw new Error('O ICO precisa de pelo menos um PNG.')
  const lados = pngs.map(ladosDoPng)
  const inicio = CABECALHO + ENTRADA * pngs.length
  const ico = new Uint8Array(
    inicio + pngs.reduce((soma, png) => soma + png.length, 0),
  )
  const dados = visao(ico)
  dados.setUint16(2, 1, true)
  dados.setUint16(4, pngs.length, true)
  let posicao = inicio
  pngs.forEach((png, i) => {
    const base = CABECALHO + ENTRADA * i
    ico[base] = lados[i].largura % LADO_MAXIMO
    ico[base + 1] = lados[i].altura % LADO_MAXIMO
    dados.setUint16(base + 4, 1, true)
    dados.setUint16(base + 6, 32, true)
    dados.setUint32(base + 8, png.length, true)
    dados.setUint32(base + 12, posicao, true)
    ico.set(png, posicao)
    posicao += png.length
  })
  return ico
}

export function imagensDoIco(ico: Uint8Array): ImagemDoIco[] {
  const dados = ico.length >= CABECALHO ? visao(ico) : null
  if (
    !dados ||
    dados.getUint16(0, true) !== 0 ||
    dados.getUint16(2, true) !== 1
  )
    throw new Error('O arquivo não é ICO.')
  return Array.from({ length: dados.getUint16(4, true) }, (_, i) => {
    const base = CABECALHO + ENTRADA * i
    const posicao = dados.getUint32(base + 12, true)
    return {
      largura: ico[base] || LADO_MAXIMO,
      altura: ico[base + 1] || LADO_MAXIMO,
      png: ico.slice(posicao, posicao + dados.getUint32(base + 8, true)),
    }
  })
}
