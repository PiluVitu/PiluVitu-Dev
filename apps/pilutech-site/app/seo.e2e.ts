import { expect, test, type Page } from '@playwright/test'
import { LADO_DO_APPLE_ICON, LADO_DO_ICONE } from '../lib/marca'

async function tamanhoDoPng(page: Page, caminho: string) {
  const resposta = await page.request.get(caminho)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('image/png')
  const corpo = await resposta.body()
  return { largura: corpo.readUInt32BE(16), altura: corpo.readUInt32BE(20) }
}

test('favicon e apple-icon: PNG do símbolo, nos tamanhos declarados', async ({
  page,
}) => {
  await page.goto('/')
  const icone = page.locator('link[rel="icon"]')
  await expect(icone).toHaveCount(1)
  await expect(icone).toHaveAttribute(
    'sizes',
    `${LADO_DO_ICONE}x${LADO_DO_ICONE}`,
  )
  await expect(icone).toHaveAttribute('type', 'image/png')
  expect(
    await tamanhoDoPng(page, (await icone.getAttribute('href')) as string),
  ).toEqual({ largura: LADO_DO_ICONE, altura: LADO_DO_ICONE })
  const apple = page.locator('link[rel="apple-touch-icon"]')
  await expect(apple).toHaveCount(1)
  expect(
    await tamanhoDoPng(page, (await apple.getAttribute('href')) as string),
  ).toEqual({ largura: LADO_DO_APPLE_ICON, altura: LADO_DO_APPLE_ICON })
})
