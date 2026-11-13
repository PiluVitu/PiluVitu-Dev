/** @jest-environment node */
import { robotsTxt } from '@/lib/rotas-publicas'
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

// O MetadataRoute.Robots do Next não escreve comentário; o llms.txt vai num `#`.
it('responde texto puro com o robots da origem canônica', async () => {
  const resposta = GET()
  expect(resposta.status).toBe(200)
  expect(resposta.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  const texto = await resposta.text()
  expect(texto).toBe(robotsTxt(ORIGEM))
  expect(texto).toContain('Sitemap: https://exemplo.test/sitemap.xml')
  expect(texto).toContain('# llms.txt: https://exemplo.test/llms.txt')
  expect(texto).not.toContain('https://piluvitu.com.br')
})

it('é estático', () => {
  expect(dynamic).toBe('force-static')
})
