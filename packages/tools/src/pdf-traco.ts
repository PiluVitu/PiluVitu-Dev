import { getStroke } from 'perfect-freehand'
import {
  pontosDoTracoNaTela,
  type ObjetoTraco,
  type PontoDoTraco,
} from './pdf-regras'

export type PontoDoContorno = [number, number]

const SUAVIZACAO = { thinning: 0.5, smoothing: 0.5, streamline: 0.5 }

// Sem pressão medida (mouse, dedo), o perfect-freehand a simula pela velocidade.
export function contornoDoTraco(
  pontos: readonly PontoDoTraco[],
  espessura: number,
  terminado = true,
): PontoDoContorno[] {
  const comPressao =
    pontos.length > 0 && pontos.every(([, , pressao]) => pressao !== undefined)
  return getStroke(
    pontos.map((ponto) => [...ponto] as number[]),
    {
      size: espessura,
      ...SUAVIZACAO,
      simulatePressure: !comPressao,
      last: terminado,
    },
  )
}

const numero = (valor: number) => valor.toFixed(2)

const meio = (a: PontoDoContorno, b: PontoDoContorno) =>
  `${numero((a[0] + b[0]) / 2)} ${numero((a[1] + b[1]) / 2)}`

// Curvas Q explícitas de ponto médio a ponto médio, sem o T do exemplo do perfect-freehand: o leitor de
// caminho do drawSvgPath do pdf-lib é o mais simples que precisa entender.
export function caminhoSvgDoContorno(
  contorno: readonly PontoDoContorno[],
): string {
  const total = contorno.length
  if (total < 3) return ''
  const partes = [`M ${meio(contorno[0], contorno[1])}`]
  for (let i = 1; i <= total; i++) {
    const controle = contorno[i % total]
    const proximo = contorno[(i + 1) % total]
    partes.push(
      `Q ${numero(controle[0])} ${numero(controle[1])} ${meio(controle, proximo)}`,
    )
  }
  partes.push('Z')
  return partes.join(' ')
}

export function caminhoDoTraco(objeto: ObjetoTraco): string {
  return caminhoSvgDoContorno(
    contornoDoTraco(pontosDoTracoNaTela(objeto), objeto.espessura),
  )
}
