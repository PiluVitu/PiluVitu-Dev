import { expect, test } from '@playwright/test'

test.describe('/privacidade', () => {
  test('h1, data, contato, a tabela de permissões e o voltar para a landing', async ({
    page,
  }) => {
    const resposta = await page.goto('/privacidade')
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Política de privacidade do Botaí',
    )
    await expect(page.locator('time[datetime="2026-10-01"]')).toHaveText(
      '1 de outubro de 2026',
    )
    await expect(
      page.locator('a[href="mailto:pilutechinformatica@gmail.com"]').first(),
    ).toBeVisible()
    await expect(page.getByRole('row', { name: /^menus\b/ })).toContainText(
      'Só no Firefox',
    )
    await page.getByRole('link', { name: 'Botaí', exact: true }).click()
    await expect(page).toHaveURL('/')
  })

  test('a landing leva até aqui', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Política de privacidade' }).click()
    await expect(page).toHaveURL('/privacidade')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Política de privacidade',
    )
  })

  // Review Focus 3: a URL longa da caixa de e-mail, em <code>, empurrava a página a 375 px.
  test.describe('a 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('sem rolagem horizontal', async ({ page }) => {
      await page.goto('/privacidade')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })
  })
})
