import { expect, test } from '@playwright/test'

test('o rodapé da home leva à política, e o topo volta para a home', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: '/privacidade' })
    .click()
  await expect(page).toHaveURL(/\/privacidade$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Política de privacidade' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Paulo Victor' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('a política carrega sem erro no console', async ({ page }) => {
  const erros: string[] = []
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text())
  })
  page.on('pageerror', (erro) => erros.push(erro.message))
  await page.goto('/privacidade')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(erros).toEqual([])
})

test('a 320 px, a política não vaza na horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/privacidade')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const { rolagem, largura } = await page.evaluate(() => ({
    rolagem: document.documentElement.scrollWidth,
    largura: document.documentElement.clientWidth,
  }))
  expect(rolagem).toBeLessThanOrEqual(largura)
})
