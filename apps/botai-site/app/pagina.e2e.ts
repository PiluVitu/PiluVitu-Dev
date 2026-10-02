import { expect, test } from '@playwright/test'

test('/ responde com o h1 do Botaí', async ({ page }) => {
  const resposta = await page.goto('/')
  expect(resposta?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Botaí')
})
