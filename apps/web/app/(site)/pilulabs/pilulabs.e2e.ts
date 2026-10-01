import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { LOJA_UI } from '../../../components/pilulabs/lojas-ui'
import { LOJAS, lojasPublicadas } from '../../../lib/pilulabs'
import { lerProdutosDoConteudo } from '../../../lib/pilulabs-conteudo'

// O esperado sai do mesmo YAML que as páginas leem: o teste continua valendo
// quando o dono marcar `listado: true` ou preencher a URL de uma loja.
const produtos = lerProdutosDoConteudo(join(__dirname, '..', '..', '..'))
const listados = produtos.filter((p) => p.listado)

async function lerJsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const textos = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  expect(textos.length).toBeGreaterThan(0)
  return textos.map((texto) => JSON.parse(texto) as Record<string, unknown>)
}

// Em dev o metadataBase é http://localhost:3000, e o servidor do teste é a
// 3333: só o caminho da URL serve para pedir a imagem.
async function caminhoDaMeta(page: Page, seletor: string): Promise<string> {
  const conteudo = await page.locator(seletor).first().getAttribute('content')
  expect(conteudo).toBeTruthy()
  const url = new URL(conteudo as string)
  return url.pathname + url.search
}

async function esperarPng(page: Page, caminho: string): Promise<void> {
  const resposta = await page.request.get(caminho)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('image/png')
}

test.describe('/pilulabs', () => {
  test('responde com h1, a linha de terminal e JSON-LD de CollectionPage', async ({
    page,
  }) => {
    const resposta = await page.goto('/pilulabs')
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
    ).toBeVisible()
    await expect(page.locator('main')).toContainText('$ ~/pilulabs')
    const [dados] = await lerJsonLd(page)
    expect(dados['@type']).toBe('CollectionPage')
  })

  test('mostra só os produtos listados no YAML, ou o estado vazio', async ({
    page,
  }) => {
    await page.goto('/pilulabs')
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
    ).toBeVisible()
    await expect(page.getByTestId('pilulabs-vazio')).toHaveCount(
      listados.length === 0 ? 1 : 0,
    )
    for (const p of produtos) {
      await expect(page.locator(`a[href="/pilulabs/${p.slug}"]`)).toHaveCount(
        p.listado ? 1 : 0,
      )
    }
  })

  test('é indexável e tem og:title e imagens OG próprios', async ({ page }) => {
    await page.goto('/pilulabs')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'PiluLabs | produtos da PiluTech',
    )
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(0)
    const og = await caminhoDaMeta(page, 'meta[property="og:image"]')
    expect(og).toContain('/pilulabs/opengraph-image')
    await esperarPng(page, og)
    const twitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
    expect(twitter).toContain('/pilulabs/twitter-image')
    await esperarPng(page, twitter)
  })
})

function produtoBotai() {
  const botai = produtos.find((p) => p.slug === 'botai')
  if (!botai) throw new Error('content/produtos/botai/index.yaml sumiu')
  return botai
}

test.describe('/pilulabs/botai', () => {
  const botai = produtoBotai()

  test('responde com h1, o resumo e a tabela de atalhos', async ({ page }) => {
    const resposta = await page.goto('/pilulabs/botai')
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: botai.nome }),
    ).toBeVisible()
    await expect(page.locator('header').first()).toContainText(botai.resumo)
    const firefox = page.getByRole('row', { name: /Firefox/ })
    await expect(firefox.getByRole('cell').nth(2)).toHaveText('Alt+Shift+P')
  })

  test('noindex segue o listado do YAML', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      `${botai.nome} | PiluLabs`,
    )
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(botai.listado ? 0 : 1)
  })

  test('botões só das lojas publicadas no YAML', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(
      page.getByRole('heading', { level: 1, name: botai.nome }),
    ).toBeVisible()
    const publicadas = lojasPublicadas(botai)
    for (const loja of LOJAS) {
      const publicada = publicadas.find((l) => l.loja === loja)
      const link = page.getByRole('link', {
        name: LOJA_UI[loja].rotulo,
        exact: true,
      })
      if (publicada) await expect(link).toHaveAttribute('href', publicada.url)
      else await expect(link).toHaveCount(0)
    }
  })

  test('JSON-LD com SoftwareApplication gratuito e a trilha PiluLabs › produto', async ({
    page,
  }) => {
    await page.goto('/pilulabs/botai')
    const [dados] = await lerJsonLd(page)
    const grafo = dados['@graph'] as Record<string, unknown>[]
    const aplicacao = grafo.find((n) => n['@type'] === 'SoftwareApplication')
    expect(aplicacao).toMatchObject({
      name: botai.nome,
      applicationCategory: 'BrowserApplication',
      offers: { price: 0 },
    })
    const urls = lojasPublicadas(botai).map((l) => l.url)
    if (urls.length > 0) expect(aplicacao).toMatchObject({ installUrl: urls })
    else expect(aplicacao).not.toHaveProperty('installUrl')
    expect(grafo.find((n) => n['@type'] === 'BreadcrumbList')).toBeTruthy()
  })

  test('liga para a política de privacidade', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(
      page.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/pilulabs/botai/privacidade')
  })

  test('imagens OG do próprio segmento', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    const og = await caminhoDaMeta(page, 'meta[property="og:image"]')
    expect(og).toContain('/pilulabs/botai/opengraph-image')
    await esperarPng(page, og)
    const twitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
    expect(twitter).toContain('/pilulabs/botai/twitter-image')
    await esperarPng(page, twitter)
  })
})
