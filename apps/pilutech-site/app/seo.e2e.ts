import { expect, test, type Page } from '@playwright/test'
import type { AxeResults, RunOptions } from 'axe-core'
import { LADO_DO_APPLE_ICON, LADO_DO_ICONE } from '../lib/marca'
import { COR_DO_TEMA, DESCRICAO_DA_HOME, TITULO_DA_HOME } from '../lib/seo'
import { SITE_DE_PRODUCAO } from '../lib/site'

const naProducao = (caminho: string) =>
  new URL(caminho, `${SITE_DE_PRODUCAO}/`).href

// O metadataBase é a produção; o servidor do teste é a 3021: só o caminho serve para pedir.
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

test('title, description, canonical, lang e indexável', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(TITULO_DA_HOME)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    DESCRICAO_DA_HOME,
  )
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute('href')
  expect(new URL(canonical as string).href).toBe(naProducao('/'))
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(
    page.locator('meta[name="robots"][content*="noindex"]'),
  ).toHaveCount(0)
  await expect(
    page.locator('meta[name="google-site-verification"]'),
  ).toHaveCount(0)
})

test('Open Graph e Twitter, com a imagem própria de 1200×630', async ({
  page,
}) => {
  await page.goto('/')
  const og = (propriedade: string) =>
    page.locator(`meta[property="og:${propriedade}"]`)
  await expect(og('type')).toHaveAttribute('content', 'website')
  await expect(og('locale')).toHaveAttribute('content', 'pt_BR')
  await expect(og('site_name')).toHaveAttribute('content', 'PiluTech')
  await expect(og('title')).toHaveAttribute('content', TITULO_DA_HOME)
  await expect(og('description')).toHaveAttribute('content', DESCRICAO_DA_HOME)
  await expect(og('image:alt')).toHaveAttribute(
    'content',
    'PiluTech: aplicativos, infraestrutura e desenvolvimento fullstack',
  )
  expect(
    new URL((await og('url').getAttribute('content')) as string).href,
  ).toBe(naProducao('/'))
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  )
  const imagemOg = await caminhoDaMeta(page, 'meta[property="og:image"]')
  expect(imagemOg.startsWith('/opengraph-image')).toBe(true)
  expect(await tamanhoDoPng(page, imagemOg)).toEqual({
    largura: 1200,
    altura: 630,
  })
  const imagemTwitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
  expect(await tamanhoDoPng(page, imagemTwitter)).toEqual({
    largura: 1200,
    altura: 630,
  })
})

test('um h1 só e títulos sem pular nível', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  const niveis = await page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((titulos) => titulos.map((t) => Number(t.tagName[1])))
  expect(niveis[0]).toBe(1)
  for (let i = 1; i < niveis.length; i++)
    expect(niveis[i] - niveis[i - 1]).toBeLessThanOrEqual(1)
})

test('toda imagem tem alt, e as dos projetos um alt descritivo', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('img:not([alt])')).toHaveCount(0)
  const alts = await page
    .locator('#projetos img')
    .evaluateAll((imagens) => imagens.map((i) => i.getAttribute('alt') ?? ''))
  expect(alts).toHaveLength(2)
  for (const alt of alts) expect(alt.length).toBeGreaterThan(30)
})

// A meta da spec é o Lighthouse mobile (não há Lighthouse no PATH): o axe a 1280 e a 320 px.
for (const largura of [1280, 320]) {
  test(`acessibilidade (axe, WCAG 2.1 A e AA) a ${largura} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: 800 })
    await page.goto('/')
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
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

test('JSON-LD: a PiluTech (Organization e ProfessionalService num nó só) e o WebSite, sem FAQPage', async ({
  page,
}) => {
  await page.goto('/')
  const textos = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  expect(textos).toHaveLength(1)
  const dados = JSON.parse(textos[0]) as {
    '@graph': Record<string, unknown>[]
  }
  expect(dados['@graph'].map((n) => n['@type'])).toEqual([
    ['Organization', 'ProfessionalService'],
    'WebSite',
  ])
  expect(dados['@graph'][0]).toMatchObject({
    '@id': 'https://pilutech.com.br/#organizacao',
    logo: 'https://pilutech.com.br/icon',
  })
  expect(textos[0]).not.toContain('FAQPage')
})

test('robots.txt libera tudo e aponta o sitemap', async ({ page }) => {
  const texto = await (await page.request.get('/robots.txt')).text()
  expect(texto).toContain('Allow: /')
  expect(texto).toContain(`Sitemap: ${SITE_DE_PRODUCAO}/sitemap.xml`)
})

test('sitemap.xml lista a página', async ({ page }) => {
  const xml = await (await page.request.get('/sitemap.xml')).text()
  expect(xml).toContain(`<loc>${SITE_DE_PRODUCAO}/</loc>`)
})

test('favicon e apple-icon: PNG do símbolo, nos tamanhos declarados', async ({
  page,
}) => {
  await page.goto('/')
  const icone = page.locator('link[rel="icon"]')
  await expect(icone).toHaveCount(1)
  await expect(icone).toHaveAttribute(
    'sizes',
    `${LADO_DO_ICONE}x${LADO_DO_ICONE}`,
  )
  await expect(icone).toHaveAttribute('type', 'image/png')
  expect(
    await tamanhoDoPng(page, (await icone.getAttribute('href')) as string),
  ).toEqual({ largura: LADO_DO_ICONE, altura: LADO_DO_ICONE })
  const apple = page.locator('link[rel="apple-touch-icon"]')
  await expect(apple).toHaveCount(1)
  expect(
    await tamanhoDoPng(page, (await apple.getAttribute('href')) as string),
  ).toEqual({ largura: LADO_DO_APPLE_ICON, altura: LADO_DO_APPLE_ICON })
  // O logo do JSON-LD é este mesmo ícone, sem a query do <link>.
  expect(await tamanhoDoPng(page, '/icon')).toEqual({
    largura: LADO_DO_ICONE,
    altura: LADO_DO_ICONE,
  })
})

test('manifest e theme-color', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
  const manifesto = await (
    await page.request.get('/manifest.webmanifest')
  ).json()
  expect(manifesto.name).toBe('PiluTech')
  const temas = page.locator('meta[name="theme-color"]')
  await expect(temas).toHaveCount(1)
  await expect(temas).toHaveAttribute('content', COR_DO_TEMA)
})
