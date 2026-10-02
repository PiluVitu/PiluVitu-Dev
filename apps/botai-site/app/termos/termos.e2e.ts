import { expect, test } from '@playwright/test'

test.describe('/termos', () => {
  test('h1, vigência, a política e o voltar para a landing', async ({
    page,
  }) => {
    const resposta = await page.goto('/termos')
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Termos de uso do Botaí',
    )
    await expect(page.locator('time[datetime="2026-10-02"]')).toHaveText(
      '2 de outubro de 2026',
    )
    await page
      .getByRole('main')
      .getByRole('link', { name: 'política de privacidade', exact: true })
      .first()
      .click()
    await expect(page).toHaveURL('/privacidade')
    await page.goto('/termos')
    await page.getByRole('link', { name: 'Botaí', exact: true }).click()
    await expect(page).toHaveURL('/')
  })

  test('o rodapé da landing leva até aqui', async ({ page }) => {
    await page.goto('/')
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Termos de uso', exact: true })
      .click()
    await expect(page).toHaveURL('/termos')
  })

  test.describe('a 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('sem rolagem horizontal', async ({ page }) => {
      await page.goto('/termos')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })
  })
})
