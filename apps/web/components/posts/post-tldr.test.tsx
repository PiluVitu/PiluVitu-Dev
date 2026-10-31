import { renderEstatico } from '@/lib/render-estatico'
import { PostTldr } from './post-tldr'

describe('PostTldr', () => {
  it('mostra o texto com o rótulo TL;DR', () => {
    const raiz = renderEstatico(<PostTldr texto="Em duas frases." />)
    const bloco = raiz.querySelector('[aria-label="TL;DR"]')
    expect(bloco?.textContent).toContain('TL;DR')
    expect(bloco?.textContent).toContain('Em duas frases.')
  })

  it('não renderiza nada com texto em branco', () => {
    const raiz = renderEstatico(<PostTldr texto="   " />)
    expect(raiz.innerHTML).toBe('')
  })

  it('o texto vira texto, nunca HTML', () => {
    const raiz = renderEstatico(
      <PostTldr texto="<img src=x onerror=alert(1)>" />,
    )
    expect(raiz.querySelector('img')).toBeNull()
    expect(raiz.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
