import { test, expect } from '@playwright/test'

test.describe('Seção de Artigos — home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('exibe o título "~/blog" da seção', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /^~\/blog\b/ })
    await expect(heading).toBeVisible()
    await expect(heading).toHaveAttribute('id', 'artigos-heading')
  })

  test('os cards de post apontam para /posts, nunca para o dev.to', async ({
    page,
  }) => {
    const cards = page.locator(
      'section[aria-labelledby="artigos-heading"] ol a',
    )
    const total = await cards.count()
    test.skip(
      total === 0,
      'sem post publicado neste ambiente (sem BLOG_REPO_TOKEN o blog vem vazio)',
    )
    for (const href of await cards.evaluateAll((links) =>
      links.map((a) => a.getAttribute('href')),
    )) {
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
