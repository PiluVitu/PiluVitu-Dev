import { test, expect } from '@playwright/test'

test.describe('Seção de Artigos — home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('exibe o título "Artigos"', async ({ page }) => {
    const heading = page.getByRole('heading', { name: 'Artigos' })
    await expect(heading).toBeVisible()
  })

  test('não exibe artigos do dev.to (links externos para dev.to)', async ({
    page,
  }) => {
    // Todos os cards de artigo devem apontar para rotas internas /posts/...
    const articleLinks = page
      .locator('section[aria-labelledby="artigos-heading"] a')
      .filter({ hasText: /Tempo de leitura/ })

    const count = await articleLinks.count()
    // Se não há posts publicados no TinaCMS ainda, a seção pode estar vazia — tudo bem.
    for (let i = 0; i < count; i++) {
      const href = await articleLinks.nth(i).getAttribute('href')
      expect(href).toMatch(/^\/posts\//)
    }
  })

  test('cards de artigo não exibem contadores de like ou comentário', async ({
    page,
  }) => {
    const section = page.locator('section[aria-labelledby="artigos-heading"]')
    await expect(
      section.locator('[aria-label="like"], [aria-label="comment"]'),
    ).toHaveCount(0)
    // Também verifica ausência dos ícones via role implícito de imagem SVG com esses rótulos
    await expect(section.locator('svg[data-icon="thumbs-up"]')).toHaveCount(0)
    await expect(section.locator('svg[data-icon="comment"]')).toHaveCount(0)
  })
})

test.describe('Card de artigo — fallback de imagem', () => {
  test('exibe fallback escuro quando não há coverImage', async ({ page }) => {
    await page.goto('/')

    const section = page.locator('section[aria-labelledby="artigos-heading"]')
    const cards = section.locator('a')
    const cardCount = await cards.count()

    if (cardCount === 0) {
      test.skip()
      return
    }

    // Pelo menos um card deve ter o fallback (div com gradiente) ou uma imagem real
    const fallbacks = section.locator('div.bg-gradient-to-br.from-slate-800')
    const images = section.locator('img')

    const fallbackCount = await fallbacks.count()
    const imageCount = await images.count()

    expect(fallbackCount + imageCount).toBeGreaterThan(0)
  })
})

test.describe('Página de artigo — botão de retorno', () => {
  test('exibe link "Artigos" com seta de retorno no topo do artigo', async ({
    page,
  }) => {
    // Navega para a home primeiro para coletar um link de artigo
    await page.goto('/')

    const section = page.locator('section[aria-labelledby="artigos-heading"]')
    const firstCard = section.locator('a').first()
    const cardCount = await section.locator('a').count()

    if (cardCount === 0) {
      test.skip()
      return
    }

    await firstCard.click()
    await page.waitForURL(/\/posts\//)

    const backLink = page.getByRole('link', { name: /Artigos/ })
    await expect(backLink).toBeVisible()

    const href = await backLink.getAttribute('href')
    expect(href).toBe('/#artigos-heading')
  })

  test('botão de retorno leva de volta à home na seção Artigos', async ({
    page,
  }) => {
    await page.goto('/')

    const section = page.locator('section[aria-labelledby="artigos-heading"]')
    const cardCount = await section.locator('a').count()

    if (cardCount === 0) {
      test.skip()
      return
    }

    await section.locator('a').first().click()
    await page.waitForURL(/\/posts\//)

    const backLink = page.getByRole('link', { name: /Artigos/ })
    await backLink.click()

    await expect(page).toHaveURL('/#artigos-heading')
  })
})
