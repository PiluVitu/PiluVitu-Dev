import { metadata } from './layout'

// O robots.txt também bloqueia /admin; o noindex segura a URL que chegar por link de fora.
it('o admin inteiro sai da busca', () => {
  expect(metadata.robots).toEqual({ index: false, follow: false })
})
