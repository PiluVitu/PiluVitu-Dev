jest.mock('@/lib/site-content', () => ({}))

import { PAGINA_PILULABS } from '@/lib/rotas-publicas'
import { metadata } from './page'

it('metadata: a descrição e o caminho vêm da lista de rotas públicas', () => {
  expect(metadata.title).toEqual({
    absolute: 'PiluLabs | produtos da PiluTech',
  })
  expect(metadata.description).toBe(PAGINA_PILULABS.descricao)
  expect(metadata.alternates?.canonical).toBe('/pilulabs')
})
