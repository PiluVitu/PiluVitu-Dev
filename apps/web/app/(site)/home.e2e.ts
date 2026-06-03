import { test, expect } from '@playwright/test'

test.describe('Home V2', () => {
  test('mostra perfil, seções e abre o modal de carreira', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: /Paulo Victor/i }),
    ).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Carreira' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Projetos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Artigos' })).toBeVisible()

    await page
      .getByRole('button', { name: /detalhes/i })
      .first()
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Atribuições')).toBeVisible()
  })
})
