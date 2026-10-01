export interface OpcoesAviso {
  titulo: string
  linha2?: string
  erro?: boolean
  onIrParaNaoReconhecido?: () => void
  onFechar: () => void
}

const SVG = 'http://www.w3.org/2000/svg'
const CAMINHO_DO_X =
  'M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z'
const QUADRADOS_DA_MARCA = [
  [1, 9],
  [9, 9],
  [9, 1],
] as const

function elemento<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag)
  el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
}

function svg(doc: Document, viewBox: string, classe?: string): SVGSVGElement {
  const el = doc.createElementNS(SVG, 'svg')
  el.setAttribute('viewBox', viewBox)
  el.setAttribute('aria-hidden', 'true')
  if (classe) el.setAttribute('class', classe)
  return el
}

function marca(doc: Document): SVGSVGElement {
  const el = svg(doc, '0 0 22 22', 'botai-marca')
  for (const [x, y] of QUADRADOS_DA_MARCA) {
    const quadrado = doc.createElementNS(SVG, 'rect')
    for (const [nome, valor] of Object.entries({
      x,
      y,
      width: 7,
      height: 7,
      rx: 1,
      fill: 'currentColor',
    })) {
      quadrado.setAttribute(nome, String(valor))
    }
    el.append(quadrado)
  }
  return el
}

function iconeFechar(doc: Document): SVGSVGElement {
  const el = svg(doc, '0 0 384 512')
  const caminho = doc.createElementNS(SVG, 'path')
  caminho.setAttribute('d', CAMINHO_DO_X)
  caminho.setAttribute('fill', 'currentColor')
  el.append(caminho)
  return el
}

function linhaDois(
  doc: Document,
  texto: string,
  ir?: () => void,
): HTMLDivElement {
  const linha = elemento(doc, 'div', 'botai-linha2')
  if (ir) {
    const botao = elemento(doc, 'button', 'botai-warn', texto)
    botao.type = 'button'
    botao.addEventListener('click', ir)
    linha.append(botao)
  } else {
    linha.append(elemento(doc, 'span', 'botai-warn', texto))
  }
  linha.append(doc.createTextNode(' · contorno tracejado'))
  return linha
}

export function construirAviso(doc: Document, o: OpcoesAviso): HTMLDivElement {
  const aviso = elemento(
    doc,
    'div',
    o.erro ? 'botai-toast botai-erro' : 'botai-toast',
  )
  aviso.setAttribute('role', o.erro ? 'alert' : 'status')

  const fechar = elemento(doc, 'button', 'botai-fechar')
  fechar.type = 'button'
  fechar.setAttribute('aria-label', 'Fechar')
  fechar.append(iconeFechar(doc))
  fechar.addEventListener('click', o.onFechar)

  const linha1 = elemento(doc, 'div', 'botai-linha1')
  linha1.append(
    marca(doc),
    elemento(doc, 'span', 'botai-titulo', o.titulo),
    fechar,
  )
  aviso.append(linha1)

  if (o.linha2 && !o.erro)
    aviso.append(linhaDois(doc, o.linha2, o.onIrParaNaoReconhecido))

  const barra = elemento(doc, 'div', 'botai-barra')
  barra.addEventListener('animationend', o.onFechar)
  const trilho = elemento(doc, 'div', 'botai-trilho')
  trilho.append(barra)
  aviso.append(trilho)
  return aviso
}
