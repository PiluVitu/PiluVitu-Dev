import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CONSULTA_DA_BANCADA_LARGA, useBancadaLarga } from './bancada-larga'

let container: HTMLDivElement
let root: Root
let larga = false
const ouvintes = new Set<() => void>()
const original = window.matchMedia

function Mostrar() {
  return <p>{useBancadaLarga() ? 'larga' : 'estreita'}</p>
}

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  larga = false
  ouvintes.clear()
  window.matchMedia = ((consulta: string) => ({
    media: consulta,
    get matches() {
      return consulta === CONSULTA_DA_BANCADA_LARGA && larga
    },
    addEventListener: (_: string, ouvinte: () => void) => ouvintes.add(ouvinte),
    removeEventListener: (_: string, ouvinte: () => void) =>
      ouvintes.delete(ouvinte),
  })) as unknown as typeof window.matchMedia
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  window.matchMedia = original
})

describe('useBancadaLarga', () => {
  it('é a largura do lg do Tailwind (64rem), a mesma das classes lg: da Bancada', () => {
    expect(CONSULTA_DA_BANCADA_LARGA).toBe('(min-width: 64rem)')
  })

  it('segue o matchMedia: larga a partir do lg, estreita abaixo, e muda quando a janela muda', () => {
    larga = true
    act(() => root.render(<Mostrar />))
    expect(container.textContent).toBe('larga')

    larga = false
    act(() => ouvintes.forEach((ouvinte) => ouvinte()))
    expect(container.textContent).toBe('estreita')
  })

  it('para de ouvir quando sai da tela', () => {
    act(() => root.render(<Mostrar />))
    expect(ouvintes.size).toBe(1)
    act(() => root.render(<></>))
    expect(ouvintes.size).toBe(0)
  })

  it('sem matchMedia, fica estreita (a lista na folha)', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    act(() => root.render(<Mostrar />))
    expect(container.textContent).toBe('estreita')
  })
})
