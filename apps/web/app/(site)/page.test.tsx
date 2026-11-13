jest.mock('@/lib/site-content', () => ({}))
jest.mock('@/lib/blog-posts', () => ({}))
jest.mock('@/lib/home/catalogo-pilutech', () => ({}))

import { DESCRICAO_DO_SITE } from '@/lib/rotas-publicas'
import { metadata } from './page'

// O canonical fica na página, não no layout raiz: lá ele valeria para toda
// página sem canonical próprio e a apontaria para a home.
it('metadata da home: a descrição do site e o canonical na raiz, sem trocar o título', () => {
  expect(metadata).toEqual({
    description: DESCRICAO_DO_SITE,
    alternates: { canonical: '/' },
  })
})
