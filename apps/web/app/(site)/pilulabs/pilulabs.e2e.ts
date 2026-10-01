import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
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
