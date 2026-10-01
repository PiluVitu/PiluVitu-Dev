import { classificarFormulario } from '@piluvitu/tools/campos'
import { valorPara } from '@piluvitu/tools/campos-formatar'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import type { ResultadoFrame } from '../../lib/resultado'
import type { Contornos } from './contornos'
import {
  cabe,
  campos,
  descrever,
  escrever,
  leuDeVolta,
  preenchivel,
  seletor,
  visivel,
} from './dom'
import type { Registro } from './registro'
import type { Escrito } from './segunda-passada'

export function contarIframesDeFora(doc: Document): number {
  return Array.from(
    doc.querySelectorAll<HTMLIFrameElement>('iframe, frame'),
  ).filter((quadro) => quadro.contentDocument === null).length
}

export function preencherDocumento(
  pessoa: Pessoa,
  hojeISO: string,
  registro: Registro,
  contornos: Contornos,
  aoEscrever?: (escrito: Escrito) => void,
): ResultadoFrame {
  const elementos = Array.from(campos(document)).filter(
    (el) => preenchivel(el) && visivel(el),
  )
  const descritores = elementos.map(descrever)
  const classes = classificarFormulario(descritores, hojeISO)
  const resultado: ResultadoFrame = {
    preenchidos: [],
    naoReconhecidos: [],
    recusados: [],
    contentType: document.contentType,
    iframesDeFora: contarIframesDeFora(document),
  }

  elementos.forEach((el, i) => {
    const classe = classes[i]
    const kind = classe?.kind
    if (kind === 'ignorar') return
    const d = descritores[i]
    const linha = {
      idx: registro.guardar(el),
      rotulo: d.label || d.ariaLabel || d.placeholder || d.name,
      seletor: seletor(el),
    }
    if (kind === undefined) {
      resultado.naoReconhecidos.push(linha)
      contornos.marcar(el, 'nao-reconhecido')
      return
    }
    const valor = valorPara(kind, pessoa, d, classe?.dicas)
    if (valor !== null && cabe(valor, d)) {
      const escreveu = el.value !== valor
      if (escreveu) escrever(el, valor)
      if (leuDeVolta(el, valor)) {
        if (escreveu) aoEscrever?.({ el, valor, lido: el.value })
        resultado.preenchidos.push(linha)
        contornos.marcar(el, 'preenchido')
        return
      }
    }
    resultado.recusados.push(linha)
    contornos.marcar(el, 'nao-reconhecido')
  })
  return resultado
}
