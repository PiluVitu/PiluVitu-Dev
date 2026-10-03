import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { TIPOS } from '@piluvitu/tools/pilulabs'
import { itensListados, linkDoItem } from '../../../lib/pilulabs'
import { lerItensDoConteudo } from '../../../lib/pilulabs-conteudo'

// O esperado sai do mesmo YAML que as páginas leem: o teste continua valendo
// quando o dono muda o catálogo pelo /admin/pilulabs.
const itens = lerItensDoConteudo(join(__dirname, '..', '..', '..'))
const listados = itensListados(itens)

const ROTULO_DO_GRUPO = {
  extensao: 'Extensões',
  mobile: 'Apps mobile',
  web: 'Apps web',
  cli: 'CLIs',
} as const

function doSlug(slug: string) {
  const item = itens.find((i) => i.slug === slug)
  if (!item) throw new Error(`content/pilulabs/${slug}/index.yaml sumiu`)
  return item
}

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

  // Review Focus 2: a chave antiga dos subdomínios pode voltar na Vercel; ela não muda mais nada.
  test('responde 200, sem 308, com o canonical e o og:url em /pilulabs', async ({
    page,
  }) => {
    const resposta = await page.request.get('/pilulabs', { maxRedirects: 0 })
    expect(resposta.status()).toBe(200)
    await page.goto('/pilulabs')
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute('href')
    expect(new URL(canonical as string).pathname).toBe('/pilulabs')
    const ogUrl = await page
      .locator('meta[property="og:url"]')
      .getAttribute('content')
    expect(new URL(ogUrl as string).pathname).toBe('/pilulabs')
  })

  test('mostra todos os listados, e só eles, agrupados por tipo na ordem fixa', async ({
    page,
  }) => {
    await page.goto('/pilulabs')
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
    ).toBeVisible()
    await expect(page.getByTestId('pilulabs-vazio')).toHaveCount(
      listados.length === 0 ? 1 : 0,
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      TIPOS.filter((tipo) => listados.some((i) => i.tipo === tipo)).map(
        (tipo) => ROTULO_DO_GRUPO[tipo],
      ),
    )
    for (const item of itens) {
      await expect(
        page.getByRole('heading', { level: 3, name: item.nome, exact: true }),
      ).toHaveCount(item.listado ? 1 : 0)
    }
  })

  test('cada card leva ao link do item', async ({ page }) => {
    await page.goto('/pilulabs')
    for (const item of listados) {
      const href = linkDoItem(item)
      if (href) await expect(page.locator(`a[href="${href}"]`)).toHaveCount(1)
    }
  })

  test('o Sombraí abre o próprio site, em aba nova', async ({ page }) => {
    const sombrai = doSlug('sombrai')
    await page.goto('/pilulabs')
    const link = page.locator(`a[href="${sombrai.site}"]`)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toContainText(sombrai.nome)
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

// O Botaí tem landing própria (apps/botai-site). Review Focus 5: link antigo, com query, segue valendo.
test.describe('o Botaí mora em botai.pilutech.com.br', () => {
  for (const [antiga, nova] of [
    [
      '/pilulabs/botai?utm_source=loja',
      'https://botai.pilutech.com.br/?utm_source=loja',
    ],
    [
      '/pilulabs/botai/privacidade?x=1',
      'https://botai.pilutech.com.br/privacidade?x=1',
    ],
  ] as const) {
    test(`${antiga} responde 308 para ${nova}`, async ({ page }) => {
      const resposta = await page.request.get(antiga, { maxRedirects: 0 })
      expect(resposta.status()).toBe(308)
      expect(new URL(resposta.headers()['location']).href).toBe(nova)
    })
  }

  test('o card do Botaí abre a landing, em aba nova', async ({ page }) => {
    const botai = doSlug('botai')
    await page.goto('/pilulabs')
    const link = page.locator(`a[href="${botai.site}"]`)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toContainText(botai.nome)
  })
})

test.describe('cabe na largura de um celular, sem rolagem horizontal', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  for (const rota of ['/pilulabs']) {
    test(rota, async ({ page }) => {
      await page.goto(rota)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })
  }
})
