import {
  LADO_MAXIMO_DA_IMAGEM,
  tipoDaImagem,
  tirarFundoBranco as tirarOFundoBranco,
} from '@piluvitu/tools/pdf-regras'

export type ImagemPreparada = {
  /** O arquivo escolhido ou, quando precisou, a imagem desenhada de novo no tamanho e na orientação da tela. */
  blob: Blob
  /** Em pixels, já na orientação em que a tela mostra. */
  largura: number
  altura: number
  reduzida: boolean
}

export type FalhaDaImagem = {
  motivo: 'nao_aceita' | 'corrompida' | 'falha_do_navegador'
}

export function ehFalhaDaImagem(erro: unknown): erro is FalhaDaImagem {
  return typeof erro === 'object' && erro !== null && 'motivo' in erro
}

// O APP1 do EXIF fica no começo do arquivo e tem no máximo 64 KB.
const BYTES_DO_CABECALHO = 128 * 1024

const QUALIDADE_DO_JPEG = 0.85

const MIME = { png: 'image/png', jpeg: 'image/jpeg' } as const

export const falha = (motivo: FalhaDaImagem['motivo']): FalhaDaImagem => ({
  motivo,
})

function orientacaoDoTiff(dados: DataView, inicio: number, fim: number) {
  if (inicio + 8 > fim) return 1
  const ordem = dados.getUint16(inicio)
  if (ordem !== 0x4949 && ordem !== 0x4d4d) return 1
  const pequeno = ordem === 0x4949
  if (dados.getUint16(inicio + 2, pequeno) !== 42) return 1
  const diretorio = inicio + dados.getUint32(inicio + 4, pequeno)
  if (diretorio + 2 > fim) return 1
  const entradas = dados.getUint16(diretorio, pequeno)
  for (let i = 0; i < entradas; i++) {
    const entrada = diretorio + 2 + i * 12
    if (entrada + 12 > fim) return 1
    if (dados.getUint16(entrada, pequeno) === 0x0112) {
      const valor = dados.getUint16(entrada + 8, pequeno)
      return valor >= 1 && valor <= 8 ? valor : 1
    }
  }
  return 1
}

/** A orientação do EXIF (1 a 8; 1 é em pé). Foto de celular costuma vir deitada nos pixels, com 6 ou 8 aqui. */
export function orientacaoDoJpeg(bytes: Uint8Array): number {
  const dados = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dados.byteLength < 4 || dados.getUint16(0) !== 0xffd8) return 1
  let posicao = 2
  while (posicao + 4 <= dados.byteLength) {
    const marcador = dados.getUint16(posicao)
    if ((marcador & 0xff00) !== 0xff00 || marcador === 0xffda) return 1
    const tamanho = dados.getUint16(posicao + 2)
    if (
      marcador === 0xffe1 &&
      posicao + 10 <= dados.byteLength &&
      dados.getUint32(posicao + 4) === 0x45786966 &&
      dados.getUint16(posicao + 8) === 0
    ) {
      return orientacaoDoTiff(
        dados,
        posicao + 10,
        Math.min(dados.byteLength, posicao + 2 + tamanho),
      )
    }
    if (tamanho < 2) return 1
    posicao += 2 + tamanho
  }
  return 1
}

export function blobDoCanvas(
  canvas: HTMLCanvasElement,
  tipo: string,
  qualidade?: number,
): Promise<Blob> {
  return new Promise((resolver, rejeitar) =>
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rejeitar(falha('falha_do_navegador'))),
      tipo,
      qualidade,
    ),
  )
}

/**
 * Confere pelos bytes que é PNG ou JPEG e devolve a imagem pronta para o PDF: maior que
 * `LADO_MAXIMO_DA_IMAGEM` no lado maior, ou JPEG com o EXIF girando a foto, ela é desenhada de novo
 * (JPEG a 0,85; PNG continua PNG, com a transparência). Com `tirarFundoBranco` (a imagem da
 * assinatura), é sempre desenhada de novo, o quase branco fica transparente e sai PNG. Rejeita com
 * {@link FalhaDaImagem}.
 */
export async function prepararImagem(
  arquivo: Blob,
  { tirarFundoBranco = false }: { tirarFundoBranco?: boolean } = {},
): Promise<ImagemPreparada> {
  let cabecalho: Uint8Array
  try {
    cabecalho = new Uint8Array(
      await arquivo.slice(0, BYTES_DO_CABECALHO).arrayBuffer(),
    )
  } catch {
    throw falha('falha_do_navegador')
  }
  const tipo = tipoDaImagem(cabecalho)
  if (!tipo) throw falha('nao_aceita')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(arquivo, {
      imageOrientation: 'from-image',
    })
  } catch {
    throw falha('corrompida')
  }
  try {
    const { width, height } = bitmap
    if (!(width > 0 && height > 0)) throw falha('corrompida')
    const escala = Math.min(1, LADO_MAXIMO_DA_IMAGEM / Math.max(width, height))
    // O pdf-lib embute o JPEG como veio, sem girar pelo EXIF: sem isto, a foto sairia deitada no PDF.
    const girada = tipo === 'jpeg' && orientacaoDoJpeg(cabecalho) !== 1
    if (escala === 1 && !girada && !tirarFundoBranco) {
      return { blob: arquivo, largura: width, altura: height, reduzida: false }
    }
    const largura = Math.max(1, Math.round(width * escala))
    const altura = Math.max(1, Math.round(height * escala))
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    try {
      const contexto = canvas.getContext('2d')
      if (!contexto) throw falha('falha_do_navegador')
      contexto.drawImage(bitmap, 0, 0, largura, altura)
      if (tirarFundoBranco) {
        const pixels = contexto.getImageData(0, 0, largura, altura)
        tirarOFundoBranco(pixels.data)
        contexto.putImageData(pixels, 0, 0)
      }
      const saida = tirarFundoBranco ? 'png' : tipo
      const blob = await blobDoCanvas(
        canvas,
        MIME[saida],
        saida === 'jpeg' ? QUALIDADE_DO_JPEG : undefined,
      )
      return { blob, largura, altura, reduzida: escala < 1 }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    bitmap.close()
  }
}
