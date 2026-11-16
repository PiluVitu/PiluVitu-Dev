import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useReduzirMovimento } from './use-reduzir-movimento'

let ouvintes: (() => void)[] = []
let reduzir = false

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = ((consulta: string) => ({
    get matches() {
      return consulta === '(prefers-reduced-motion: reduce)' && reduzir
    },
    addEventListener: (_: string, f: () => void) => ouvintes.push(f),
    removeEventListener: (_: string, f: () => void) => {
      ouvintes = ouvintes.filter((o) => o !== f)
    },
  })) as unknown as typeof window.matchMedia
})

function Sonda() {
  return <p>{useReduzirMovimento() ? 'reduzir' : 'normal'}</p>
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  reduzir = false
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(() => act(() => root.unmount()))

it('segue a preferência do sistema e reage quando ela muda', () => {
  act(() => root.render(<Sonda />))
  expect(container.textContent).toBe('normal')

  reduzir = true
  act(() => ouvintes.forEach((o) => o()))

  expect(container.textContent).toBe('reduzir')
})

it('para de ouvir ao desmontar', () => {
  act(() => root.render(<Sonda />))
  expect(ouvintes).toHaveLength(1)

  act(() => root.unmount())
  root = createRoot(container)

  expect(ouvintes).toHaveLength(0)
})
