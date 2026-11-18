import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useProtegerAJanela } from './zona-de-arquivos'

let container: HTMLDivElement
let root: Root

function Protegida() {
  useProtegerAJanela()
  return null
}

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

// O jsdom não tem DragEvent: um Event com o dataTransfer chega igual ao ouvinte da janela.
function arrastar(tipo: 'dragover' | 'drop', tipos: string[]) {
  const evento = new Event(tipo, { bubbles: true, cancelable: true })
  Object.defineProperty(evento, 'dataTransfer', { value: { types: tipos } })
  document.body.dispatchEvent(evento)
  return evento.defaultPrevented
}

describe('useProtegerAJanela', () => {
  it('montado, soltar um arquivo em qualquer lugar da janela não deixa o navegador abrir o arquivo', () => {
    act(() => root.render(<Protegida />))

    expect(arrastar('dragover', ['Files'])).toBe(true)
    expect(arrastar('drop', ['Files'])).toBe(true)
  })

  it('arrastar texto fica com o navegador, e desmontado a janela volta ao normal', () => {
    act(() => root.render(<Protegida />))
    expect(arrastar('drop', ['text/plain'])).toBe(false)

    act(() => root.render(<></>))
    expect(arrastar('dragover', ['Files'])).toBe(false)
    expect(arrastar('drop', ['Files'])).toBe(false)
  })
})
