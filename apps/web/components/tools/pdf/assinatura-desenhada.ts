import {
  escalaDaAssinatura,
  type Cor,
  type PontoDoTraco,
} from '@piluvitu/tools/pdf-regras'
import {
  caixaDosTracos,
  caminhoSvgDoContorno,
  contornoDoTraco,
} from '@piluvitu/tools/pdf-traco'
import { blobDoCanvas, falha, type ImagemPreparada } from './imagem-inserida'

/**
 * O PNG da assinatura desenhada no quadro: recortado no traço, com o fundo transparente e no máximo
 * `LARGURA_MAXIMA_DA_ASSINATURA` px de largura. Rejeita com `RangeError` sem traço e com
 * {@link FalhaDaImagem} quando o navegador não desenha.
 */
export async function desenharAssinatura(
  tracos: readonly (readonly PontoDoTraco[])[],
  { cor, espessura }: { cor: Cor; espessura: number },
): Promise<ImagemPreparada> {
  const recorte = caixaDosTracos(tracos, espessura)
  if (!recorte) throw new RangeError('assinatura sem traço')
  const { largura, altura, escala } = escalaDaAssinatura(recorte)
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  try {
    const contexto = canvas.getContext('2d')
    if (!contexto) throw falha('falha_do_navegador')
    contexto.setTransform(
      escala,
      0,
      0,
      escala,
      -recorte.x * escala,
      -recorte.y * escala,
    )
    contexto.fillStyle = cor
    for (const pontos of tracos) {
      if (!pontos.length) continue
      contexto.fill(
        new Path2D(caminhoSvgDoContorno(contornoDoTraco(pontos, espessura))),
      )
    }
    const blob = await blobDoCanvas(canvas, 'image/png')
    return { blob, largura, altura, reduzida: false }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
