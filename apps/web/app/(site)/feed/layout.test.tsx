import { metadata } from './layout'

// O /feed só agrega posts de outros sites, carregados no navegador, e não tem
// link no site: fica fora do sitemap e da busca.
it('o feed não é indexado, mas os links dele seguem', () => {
  expect(metadata.robots).toEqual({ index: false, follow: true })
})

it('não troca o título nem a descrição herdados', () => {
  expect(metadata).not.toHaveProperty('title')
  expect(metadata).not.toHaveProperty('description')
})
