/** @jest-environment node */
jest.mock('@/lib/dados-publicos', () => ({
  lerDadosPublicos: async () => ({
    perfil: {
      displayName: 'Nome do Perfil',
      roleHighlight: 'Site Reliability Engineering',
      companyName: 'Reapho',
      companyLink: 'https://reapho.app/en',
      bio: 'A bio da home.',
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

it('responde o conteúdo das páginas em Markdown, em texto puro', async () => {
  const resposta = await GET()
  expect(resposta.status).toBe(200)
  expect(resposta.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  const texto = await resposta.text()
  expect(texto.startsWith('# Nome do Perfil\n')).toBe(true)
  expect(texto).toContain('## Perfil')
  expect(texto).toContain('A bio da home.')
  expect(texto).toContain('[llms.txt](https://exemplo.test/llms.txt)')
  expect(texto).not.toContain('https://piluvitu.com.br')
})

it('é gerado no build', () => {
  expect(dynamic).toBe('force-static')
})
