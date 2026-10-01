import { renderEstatico } from '@/lib/render-estatico'
import { JsonLd } from './json-ld'

describe('JsonLd', () => {
  it('renderiza um script application/ld+json com o JSON escapado', () => {
    const raiz = renderEstatico(<JsonLd dados={{ name: 'a<b' }} />)
    const script = raiz.querySelector('script[type="application/ld+json"]')
    expect(script?.textContent).toBe('{"name":"a\\u003cb"}')
  })
})
