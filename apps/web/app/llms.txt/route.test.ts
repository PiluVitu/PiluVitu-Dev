/** @jest-environment node */
jest.mock('@/lib/dados-publicos', () => ({
  lerDadosPublicos: async () => ({
    perfil: {
      displayName: 'Nome do Perfil',
      roleHighlight: 'Site Reliability Engineering',
      companyName: 'Reapho',
      companyLink: 'https://reapho.app/en',
      bio: 'Bio.',
      location: 'Brasil · Remoto',
      disciplines: [],
    },
    socials: [],
    carreiras: [],
    piluLabs: [],
    posts: [],
  }),
}))

import { dynamic, GET } from './route'

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

it('responde o llms.txt em texto puro, com os links na origem canônica', async () => {
  const resposta = await GET()
  expect(resposta.status).toBe(200)
  expect(resposta.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  const texto = await resposta.text()
  expect(texto.startsWith('# Nome do Perfil\n')).toBe(true)
  expect(texto).toContain('- [Página inicial](https://exemplo.test/): ')
  expect(texto).not.toContain('https://piluvitu.com.br')
})

it('é gerado no build', () => {
  expect(dynamic).toBe('force-static')
})
