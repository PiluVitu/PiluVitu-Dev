import { expect, test, type Page } from '@playwright/test'
import { lojasPublicadas } from '@piluvitu/tools/pilulabs'
import type { AxeResults, RunOptions } from 'axe-core'
import { lerUrlsDasLojas } from '../lib/cms'
import {
  DESCRICAO_DA_HOME,
  DESCRICAO_DA_PRIVACIDADE,
  DESCRICAO_DOS_TERMOS,
  TITULO_DA_HOME,
  TITULO_DA_PRIVACIDADE,
  TITULO_DOS_TERMOS,
} from '../lib/seo'
import { SITE_DE_PRODUCAO } from '../lib/site'

const ROTAS = [
  {
    caminho: '/',
    titulo: TITULO_DA_HOME,
    descricao: DESCRICAO_DA_HOME,
    imagem: '/opengraph-image',
  },
  {
    caminho: '/privacidade',
    titulo: TITULO_DA_PRIVACIDADE,
    descricao: DESCRICAO_DA_PRIVACIDADE,
    imagem: '/privacidade/opengraph-image',
  },
  {
    caminho: '/termos',
    titulo: TITULO_DOS_TERMOS,
    descricao: DESCRICAO_DOS_TERMOS,
    imagem: '/termos/opengraph-image',
  },
] as const

const naProducao = (caminho: string) =>
  new URL(caminho, `${SITE_DE_PRODUCAO}/`).href

async function lerJsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const textos = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  expect(textos.length).toBeGreaterThan(0)
  return textos.map((texto) => JSON.parse(texto) as Record<string, unknown>)
}

// O metadataBase é a produção; o servidor do teste é a 3020: só o caminho serve para pedir.
async function caminhoDaMeta(page: Page, seletor: string): Promise<string> {
  const conteudo = await page.locator(seletor).first().getAttribute('content')
  expect(conteudo).toBeTruthy()
  const url = new URL(conteudo as string)
  return url.pathname + url.search
}

async function tamanhoDoPng(page: Page, caminho: string) {
  const resposta = await page.request.get(caminho)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('image/png')
  const corpo = await resposta.body()
  return { largura: corpo.readUInt32BE(16), altura: corpo.readUInt32BE(20) }
}

for (const rota of ROTAS) {
  test.describe(`SEO de ${rota.caminho}`, () => {
    test('title, description, canonical, lang e indexável', async ({
      page,
    }) => {
      await page.goto(rota.caminho)
      await expect(page).toHaveTitle(rota.titulo)
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        rota.descricao,
      )
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href')
      expect(new URL(canonical as string).href).toBe(naProducao(rota.caminho))
      await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
      await expect(
        page.locator('meta[name="robots"][content*="noindex"]'),
      ).toHaveCount(0)
    })

    test('Open Graph e Twitter, com a imagem 1200×630 do próprio segmento', async ({
      page,
    }) => {
      await page.goto(rota.caminho)
      const og = (propriedade: string) =>
        page.locator(`meta[property="og:${propriedade}"]`)
      await expect(og('type')).toHaveAttribute('content', 'website')
      await expect(og('locale')).toHaveAttribute('content', 'pt_BR')
      await expect(og('site_name')).toHaveAttribute('content', 'Botaí')
      await expect(og('title')).toHaveAttribute('content', rota.titulo)
      await expect(og('description')).toHaveAttribute('content', rota.descricao)
      const urlOg = await og('url').getAttribute('content')
      expect(new URL(urlOg as string).href).toBe(naProducao(rota.caminho))
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      )
      const imagemOg = await caminhoDaMeta(page, 'meta[property="og:image"]')
      expect(imagemOg.startsWith(rota.imagem)).toBe(true)
      expect(await tamanhoDoPng(page, imagemOg)).toEqual({
        largura: 1200,
        altura: 630,
      })
      const imagemTwitter = await caminhoDaMeta(
        page,
        'meta[name="twitter:image"]',
      )
      expect(await tamanhoDoPng(page, imagemTwitter)).toEqual({
        largura: 1200,
        altura: 630,
      })
    })

    test('um h1 só e títulos sem pular nível', async ({ page }) => {
      await page.goto(rota.caminho)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      const niveis = await page
        .locator('h1, h2, h3, h4, h5, h6')
        .evaluateAll((titulos) => titulos.map((t) => Number(t.tagName[1])))
      expect(niveis[0]).toBe(1)
      for (let i = 1; i < niveis.length; i++)
        expect(niveis[i] - niveis[i - 1]).toBeLessThanOrEqual(1)
    })

    test('toda imagem tem alt, e as capturas um alt descritivo', async ({
      page,
    }) => {
      await page.goto(rota.caminho)
      await expect(page.locator('img:not([alt])')).toHaveCount(0)
      const alts = await page
        .locator('img[src*="capturas"]')
        .evaluateAll((imagens) =>
          imagens.map((i) => i.getAttribute('alt') ?? ''),
        )
      for (const alt of alts) expect(alt.length).toBeGreaterThan(40)
    })

    // A meta da spec é o Lighthouse mobile: a 320 px a tabela de atalhos rola dentro da moldura, e só
    // ali o axe vê o scrollable-region-focusable.
    for (const tema of ['light', 'dark'] as const)
      for (const largura of [1280, 320]) {
        test(`acessibilidade (axe, WCAG 2.1 A e AA), tema ${tema}, ${largura} px`, async ({
          page,
        }) => {
          await page.setViewportSize({ width: largura, height: 800 })
          await page.emulateMedia({ colorScheme: tema })
          await page.goto(rota.caminho)
          await page.addScriptTag({
            path: require.resolve('axe-core/axe.min.js'),
          })
          const violacoes = await page.evaluate(async () => {
            const { axe } = window as unknown as {
              axe: {
                run: (alvo: Document, opcoes: RunOptions) => Promise<AxeResults>
              }
            }
            const { violations } = await axe.run(document, {
              runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
              },
            })
            return violations
              .filter((v) => v.impact === 'serious' || v.impact === 'critical')
              .map(
                (v) =>
                  `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
              )
          })
          expect(violacoes).toEqual([])
        })
      }
  })
}

test('JSON-LD de /: SoftwareApplication gratuito, sem nota, com as lojas do CMS', async ({
  page,
}) => {
  await page.goto('/')
  const [dados] = await lerJsonLd(page)
  const grafo = dados['@graph'] as Record<string, unknown>[]
  expect(grafo.map((n) => n['@type'])).toEqual([
    'Organization',
    'WebSite',
    'SoftwareApplication',
  ])
  const aplicacao = grafo[2]
  expect(aplicacao).toMatchObject({
    name: 'Botaí',
    applicationCategory: 'BrowserApplication',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
  })
  expect(aplicacao).not.toHaveProperty('aggregateRating')
  const lojas = lojasPublicadas(lerUrlsDasLojas()).map((l) => l.url)
  if (lojas.length > 0) expect(aplicacao.installUrl).toEqual(lojas)
  else expect(aplicacao).not.toHaveProperty('installUrl')
})

test('JSON-LD de /privacidade: a trilha Botaí › Política', async ({ page }) => {
  await page.goto('/privacidade')
  const [dados] = await lerJsonLd(page)
  expect(dados['@type']).toBe('BreadcrumbList')
})

test('JSON-LD de /termos: a trilha Botaí › Termos de uso', async ({ page }) => {
  await page.goto('/termos')
  const [dados] = await lerJsonLd(page)
  expect(dados['@type']).toBe('BreadcrumbList')
  const itens = dados.itemListElement as { name: string }[]
  expect(itens.map((i) => i.name)).toEqual(['Botaí', 'Termos de uso'])
})

test('robots.txt libera tudo e aponta o sitemap', async ({ page }) => {
  const texto = await (await page.request.get('/robots.txt')).text()
  expect(texto).toContain('Allow: /')
  expect(texto).toContain(`Sitemap: ${SITE_DE_PRODUCAO}/sitemap.xml`)
})

test('sitemap.xml lista as três rotas', async ({ page }) => {
  const xml = await (await page.request.get('/sitemap.xml')).text()
  expect(xml).toContain(`<loc>${SITE_DE_PRODUCAO}/</loc>`)
  expect(xml).toContain(`<loc>${SITE_DE_PRODUCAO}/privacidade</loc>`)
  expect(xml).toContain(`<loc>${SITE_DE_PRODUCAO}/termos</loc>`)
})

test('ícones, manifest e theme-color claro e escuro', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1)
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
  expect(await tamanhoDoPng(page, '/icon.png')).toEqual({
    largura: 300,
    altura: 300,
  })
  const manifesto = await (
    await page.request.get('/manifest.webmanifest')
  ).json()
  expect(manifesto.name).toBe('Botaí')
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2)
})
