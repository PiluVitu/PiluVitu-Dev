import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { itensListados, linkDoItem } from '../lib/pilulabs'
import { lerItensDoConteudo } from '../lib/pilulabs-conteudo'
import { rotasPublicas, urlAbsoluta } from '../lib/rotas-publicas'

// Roda pelo playwright.seo.config.ts: build de produção com NEXT_PUBLIC_SITE_URL
// nesta origem e `next start` numa porta local. Os links absolutos apontam para
// a produção; para pedir, só o caminho serve.
const ORIGEM = 'https://piluvitu.com.br'
const LLMS = [`${ORIGEM}/llms.txt`, `${ORIGEM}/llms-full.txt`]

const itens = lerItensDoConteudo(join(__dirname, '..'))
// Os posts dependem do token do blog no build; sem ele a lista vem vazia, e o
// teste confere os posts que vierem contra o llms.txt, sem inventar nenhum.
const semPosts = rotasPublicas({ posts: [], piluLabs: itens })

const caminho = (url: string) => {
  const { pathname, search } = new URL(url)
  return pathname + search
}

const ehDoSite = (url: string) => url.startsWith(`${ORIGEM}/`)
const ehPost = (url: string) => url.startsWith(`${ORIGEM}/posts/`)

function linksDoMarkdown(texto: string): string[] {
  return [...texto.matchAll(/\]\(([^)\s]+)\)/g)].map(([, url]) => url)
}

function secao(texto: string, titulo: string): string {
  const inicio = texto.indexOf(`\n## ${titulo}\n`)
  if (inicio < 0) return ''
  const fim = texto.indexOf('\n## ', inicio + 1)
  return texto.slice(inicio, fim < 0 ? undefined : fim)
}

async function lerTexto(page: Page, url: string): Promise<string> {
  const resposta = await page.request.get(url)
  expect(resposta.status(), url).toBe(200)
  return resposta.text()
}

// Lido como XML, como a busca lê: o `&amp;` do <loc> volta a ser `&`.
async function locsDoSitemap(page: Page): Promise<string[]> {
  return page.evaluate(
    (fonte) =>
      [
        ...new DOMParser()
          .parseFromString(fonte, 'application/xml')
          .getElementsByTagName('loc'),
      ].map((loc) => loc.textContent ?? ''),
    await lerTexto(page, '/sitemap.xml'),
  )
}

test('robots.txt: texto puro, libera o site, bloqueia admin, api e preview e aponta sitemap e llms.txt', async ({
  page,
}) => {
  const resposta = await page.request.get('/robots.txt')
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toBe('text/plain; charset=utf-8')
  const linhas = (await resposta.text()).split('\n')
  for (const linha of [
    'User-Agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    'Disallow: /preview',
    `Sitemap: ${ORIGEM}/sitemap.xml`,
    `# llms.txt: ${ORIGEM}/llms.txt`,
  ])
    expect(linhas).toContain(linha)
})

test('sitemap.xml: XML válido com exatamente as rotas públicas, os posts publicados e os dois llms', async ({
  page,
}) => {
  const resposta = await page.request.get('/sitemap.xml')
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('application/xml')
  const xml = await resposta.text()
  const raiz = await page.evaluate((fonte) => {
    const doc = new DOMParser().parseFromString(fonte, 'application/xml')
    return {
      erro: doc.getElementsByTagName('parsererror').length,
      nome: doc.documentElement.localName,
      ns: doc.documentElement.namespaceURI,
    }
  }, xml)
  expect(raiz).toEqual({
    erro: 0,
    nome: 'urlset',
    ns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
  })

  const locs = await locsDoSitemap(page)
  expect(new Set(locs).size).toBe(locs.length)
  expect(locs.filter((url) => !ehPost(url))).toEqual([
    ...semPosts.map(({ caminho: c }) => urlAbsoluta(c, ORIGEM)),
    ...LLMS,
  ])

  const postsDoLlms = linksDoMarkdown(
    secao(await lerTexto(page, '/llms.txt'), 'Posts'),
  )
  expect(locs.filter(ehPost)).toEqual(postsDoLlms)
})

for (const arquivo of ['/llms.txt', '/llms-full.txt'])
  test(`${arquivo}: 200 em texto puro, no formato do llmstxt.org`, async ({
    page,
  }) => {
    const resposta = await page.request.get(arquivo)
    expect(resposta.status()).toBe(200)
    expect(resposta.headers()['content-type']).toBe('text/plain; charset=utf-8')
    const texto = await resposta.text()
    const linhas = texto.split('\n')
    expect(linhas[0]).toBe('# Paulo Victor Torres Silva')
    expect(linhas[2]).toMatch(/^> \S/)
    expect(texto).not.toMatch(/@|mailto:|\btel:|wa\.me|whatsapp/i)
  })

test('todo link do site no llms.txt, no llms-full.txt e no sitemap responde 200, sem redirecionar', async ({
  page,
}) => {
  const urls = new Set([
    ...linksDoMarkdown(await lerTexto(page, '/llms.txt')),
    ...linksDoMarkdown(await lerTexto(page, '/llms-full.txt')),
    ...(await locsDoSitemap(page)),
  ])
  const doSite = [...urls].filter(ehDoSite)
  expect(doSite.length).toBeGreaterThan(semPosts.length)
  for (const url of doSite) {
    const resposta = await page.request.get(caminho(url), { maxRedirects: 0 })
    expect(resposta.status(), url).toBe(200)
  }
})

// Sem pedido para fora: o link externo tem de ser https e o mesmo que a página mostra.
test('links de fora do llms.txt: https, os mesmos perfis da home e os mesmos cards do /pilulabs', async ({
  page,
}) => {
  const texto = await lerTexto(page, '/llms.txt')
  const externos = linksDoMarkdown(texto).filter((url) => !ehDoSite(url))
  for (const url of externos) expect(new URL(url).protocol).toBe('https:')

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const perfisDaHome = await page
    .locator('nav[aria-label="Redes sociais e contato"] a[target="_blank"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''))
  expect(perfisDaHome.length).toBeGreaterThan(0)
  expect(linksDoMarkdown(secao(texto, 'Perfis'))).toEqual(
    perfisDaHome.filter((url) => url.startsWith('https://')),
  )

  await page.goto('/pilulabs', { waitUntil: 'domcontentloaded' })
  const linksDaVitrine = await page
    .locator('main a[href]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href')))
  const doPiluLabs = linksDoMarkdown(secao(texto, 'PiluLabs'))
  const esperados = itensListados(itens).flatMap((item) => {
    const link = linkDoItem(item)
    return link ? [link.startsWith('/') ? urlAbsoluta(link, ORIGEM) : link] : []
  })
  expect(doPiluLabs).toEqual(esperados)
  for (const url of doPiluLabs.filter((u) => !ehDoSite(u)))
    expect(linksDaVitrine).toContain(url)
})

test.describe('meta description e canonical em cada página pública', () => {
  for (const { caminho: c, descricao } of semPosts)
    test(c, async ({ page }) => {
      const resposta = await page.goto(c, { waitUntil: 'domcontentloaded' })
      expect(resposta?.status()).toBe(200)
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        descricao,
      )
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href')
      expect(new URL(canonical as string).href).toBe(urlAbsoluta(c, ORIGEM))
      await expect(
        page.locator('meta[name="robots"][content*="noindex"]'),
      ).toHaveCount(0)
    })

  test('cada post do sitemap', async ({ page }) => {
    const posts = (await locsDoSitemap(page)).filter(ehPost)
    for (const url of posts) {
      await page.goto(caminho(url), { waitUntil: 'domcontentloaded' })
      const descricao = await page
        .locator('meta[name="description"]')
        .getAttribute('content')
      expect(descricao?.trim(), url).toBeTruthy()
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href')
      expect(new URL(canonical as string).href).toBe(url)
    }
  })
})

for (const [c, conteudo] of [
  ['/admin', 'noindex, nofollow'],
  ['/feed', 'noindex, follow'],
] as const)
  test(`${c} fica fora da busca (${conteudo})`, async ({ page }) => {
    await page.goto(c, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      conteudo,
    )
  })
