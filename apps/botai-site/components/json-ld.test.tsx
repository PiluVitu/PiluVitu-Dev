import { render } from '@testing-library/react'
import { JsonLd } from './json-ld'

it('um script application/ld+json com o JSON escapado', () => {
  const { container } = render(<JsonLd dados={{ name: '</script>' }} />)
  const script = container.querySelector('script[type="application/ld+json"]')
  expect(script?.innerHTML).toBe('{"name":"\\u003c/script>"}')
})
