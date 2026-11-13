/** @jest-environment node */
const mockPerfil: { atual: unknown } = { atual: null }

jest.mock('server-only', () => ({}))
jest.mock('@/lib/site-content', () => ({
  getSiteProfile: async () => mockPerfil.atual,
  getSocials: async () => [{ id: 'github' }],
  getCarreiras: async () => [{ id: 'reapho' }],
  getPiluLabs: async () => [{ slug: 'botai' }],
}))
// Rascunho nunca chega ao sitemap nem ao llms.txt: as outras leituras do blog
// (que mostram rascunho em draft mode ou no admin) não podem ser usadas aqui.
jest.mock('@/lib/blog-posts', () => ({
  getPublishedBlogPosts: async () => [{ slug: 'publicado' }],
  getBlogPosts: async () => {
    throw new Error('getBlogPosts mostra rascunho em draft mode')
  },
  getAllBlogPosts: async () => {
    throw new Error('getAllBlogPosts traz os rascunhos')
  },
}))

import { lerDadosPublicos } from './dados-publicos'
import { PERFIL_PADRAO } from './perfil-padrao'

describe('lerDadosPublicos', () => {
  beforeEach(() => {
    mockPerfil.atual = null
  })

  it('junta o perfil, as redes, a carreira, o PiluLabs e só os posts publicados', async () => {
    mockPerfil.atual = { displayName: 'Do CMS' }
    expect(await lerDadosPublicos()).toEqual({
      perfil: { displayName: 'Do CMS' },
      socials: [{ id: 'github' }],
      carreiras: [{ id: 'reapho' }],
      piluLabs: [{ slug: 'botai' }],
      posts: [{ slug: 'publicado' }],
    })
  })

  it('sem perfil no CMS, usa o mesmo perfil padrão da home', async () => {
    expect((await lerDadosPublicos()).perfil).toBe(PERFIL_PADRAO)
  })
})
