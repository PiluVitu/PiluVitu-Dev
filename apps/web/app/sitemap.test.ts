/** @jest-environment node */
jest.mock('@/lib/dados-publicos', () => ({
  lerDadosPublicos: async () => ({
    perfil: {},
    socials: [],
    carreiras: [],
    piluLabs: [],
    posts: [
      {
        slug: 'husky',
        title: 'Como usar o Husky',
        excerpt: 'O excerpt.',
        metaDescription: '',
        publishedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  }),
}))

import { TOOLS } from '@/lib/tools-registry'
import sitemap from './sitemap'

// Origem diferente do fallback do site-url.ts: prova que a URL vem do getCanonicalSiteUrl.
const ORIGEM = 'https://exemplo.test'
const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL
beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGEM
})
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL
})

it('lista as rotas públicas, os posts publicados e os dois llms, na origem canônica', async () => {
  const entradas = await sitemap()
  expect(entradas.map(({ url }) => url)).toEqual([
    `${ORIGEM}/`,
    `${ORIGEM}/pilulabs`,
    `${ORIGEM}/tools`,
    `${ORIGEM}/tasks`,
    `${ORIGEM}/privacidade`,
    ...TOOLS.map(({ slug }) => `${ORIGEM}/tools/${slug}`),
    `${ORIGEM}/posts/husky`,
    `${ORIGEM}/llms.txt`,
    `${ORIGEM}/llms-full.txt`,
  ])
})

it('a data só vem do post', async () => {
  const entradas = await sitemap()
  expect(entradas.filter((e) => e.lastModified)).toEqual([
    {
      url: `${ORIGEM}/posts/husky`,
      lastModified: '2025-01-01T00:00:00.000Z',
    },
  ])
})
