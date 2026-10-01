import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

export function renderEstatico(elemento: ReactElement): HTMLDivElement {
  const raiz = document.createElement('div')
  raiz.innerHTML = renderToStaticMarkup(elemento)
  return raiz
}
