import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { FeedSearch } from './feed-search'

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  jest.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.useRealTimers()
})

function renderizar(value: string, onChange: (v: string) => void) {
  act(() => root.render(<FeedSearch value={value} onChange={onChange} />))
}

function campo(): HTMLInputElement {
  return container.querySelector('input[aria-label="Buscar posts"]')!
}

// O React ouve o setter nativo do value; atribuir direto não dispara onChange.
function digitar(texto: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!
  act(() => {
    setter.call(campo(), texto)
    campo().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('FeedSearch', () => {
  it('mostra o texto digitado na hora e só avisa o pai depois de 300 ms', () => {
    const onChange = jest.fn()
    renderizar('', onChange)

    digitar('react')
    expect(campo().value).toBe('react')
    expect(onChange).not.toHaveBeenCalled()

    act(() => jest.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('react')
  })

  it('digitação rápida dispara um aviso só, com o último texto', () => {
    const onChange = jest.fn()
    renderizar('', onChange)

    digitar('re')
    act(() => jest.advanceTimersByTime(100))
    digitar('react')
    act(() => jest.advanceTimersByTime(300))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('react')
  })

  // O pai pode trocar o valor por fora (ex.: "limpar busca" ou a URL mudou);
  // o campo tem que acompanhar, senão mostra um texto que não é o filtro real.
  it('acompanha o valor quando o pai o troca por fora', () => {
    const onChange = jest.fn()
    renderizar('react', onChange)
    expect(campo().value).toBe('react')

    renderizar('', onChange)
    expect(campo().value).toBe('')

    renderizar('next', onChange)
    expect(campo().value).toBe('next')
    expect(onChange).not.toHaveBeenCalled()
  })
})
