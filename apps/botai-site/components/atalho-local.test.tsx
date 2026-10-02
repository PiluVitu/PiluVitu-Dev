import { act, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { AtalhoLocal } from './atalho-local'

const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0'

function simular(plataforma: string, userAgent = 'Mozilla/5.0') {
  jest.spyOn(navigator, 'platform', 'get').mockReturnValue(plataforma)
  jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

afterEach(() => {
  jest.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('AtalhoLocal', () => {
  it('o HTML do servidor traz o atalho do Windows', () => {
    simular('MacIntel')
    const raiz = document.createElement('div')
    raiz.innerHTML = renderToString(<AtalhoLocal />)
    expect(raiz.textContent).toBe('Ctrl+Shift+Y preenche a página no Windows')
  })

  // useSyncExternalStore: hidrata com o valor do servidor e só então troca, sem erro de hidratação.
  it('no Mac, depois da hidratação, ⌥⇧P e macOS, sem erro', async () => {
    simular('MacIntel')
    const raiz = document.createElement('div')
    raiz.innerHTML = renderToString(<AtalhoLocal />)
    document.body.append(raiz)
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => {
      hydrateRoot(raiz, <AtalhoLocal />)
    })
    expect(raiz.textContent).toBe('⌥⇧P preenche a página no macOS')
    expect(erro).not.toHaveBeenCalled()
  })

  it('Firefox no Linux: Alt+Shift+P', () => {
    simular('Linux x86_64', FIREFOX_LINUX)
    render(<AtalhoLocal />)
    expect(screen.getByText('Alt+Shift+P').tagName).toBe('KBD')
  })
})
