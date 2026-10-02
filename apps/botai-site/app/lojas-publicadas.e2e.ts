import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { lerUrlsDasLojas } from '../lib/cms'

// Roda só pelo playwright.lojas.config.ts, que builda a landing com este YAML no lugar do CMS.
const URLS = lerUrlsDasLojas(join(__dirname, 'lojas-publicadas.yaml'))

test('a fixture: Firefox publicado, Chrome com link de outra loja, Edge em http', () => {
  expect(URLS.firefoxUrl).toMatch(/^https:\/\/addons\.mozilla\.org\//)
  expect(URLS.chromeUrl).toMatch(/^https:\/\/microsoftedge\.microsoft\.com\//)
  expect(URLS.edgeUrl).toMatch(/^http:\/\//)
  expect(URLS.operaUrl).toBe('')
})

test('Firefox publicado: link nos dois blocos, em aba nova', async ({
  page,
}) => {
  await page.goto('/')
  const links = page.getByRole('link', { name: 'Firefox Add-ons', exact: true })
  await expect(links).toHaveCount(2)
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', URLS.firefoxUrl)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
})

// Review Focus 1: link de outra loja ou em http não vira botão.
test('as outras três seguem "Em breve", desabilitadas e sem link', async ({
  page,
}) => {
  await page.goto('/')
  for (const rotulo of [
    'Chrome Web Store',
    'Microsoft Edge Add-ons',
    'Opera add-ons',
  ]) {
    const botoes = page.getByRole('button', { name: `${rotulo} Em breve` })
    await expect(botoes).toHaveCount(2)
    for (const botao of await botoes.all()) await expect(botao).toBeDisabled()
  }
  await expect(page.locator('a[href*="microsoftedge"]')).toHaveCount(0)
})

test('o selo diz "Disponível" e a nota cita só o Firefox', async ({ page }) => {
  await page.goto('/')
  const topo = page.getByRole('banner')
  await expect(topo.getByText('Disponível', { exact: true })).toBeVisible()
  await expect(
    topo.getByText('Firefox · grátis e de código aberto', { exact: true }),
  ).toBeVisible()
})
