import { expect, test } from '../../test/extensao.fixture'
import type { browser } from 'wxt/browser'

declare const chrome: typeof browser

test('popup mostra um CPF formatado', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByText(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Preencher página' }),
  ).toBeVisible()
})

test('pessoa persiste entre aberturas do popup', async ({
  context,
  extensionId,
}) => {
  const a = await context.newPage()
  await a.goto(`chrome-extension://${extensionId}/popup.html`)
  const cpf1 = await a.getByText(/^\d{3}\./).textContent()
  await a.close()
  const b = await context.newPage()
  await b.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(b.getByText(/^\d{3}\./)).toHaveText(cpf1!)
})

test('injecao sob demanda preenche o formulario', async ({
  context,
  page,
  sw,
}) => {
  await context.route('http://teste.local/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<form><input name="cpf"></form>',
    }),
  )
  await page.goto('http://teste.local/form')
  const resultado = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    })
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        files: ['/preencher.js'],
      })
      return 'ok'
    } catch (e) {
      return String(e)
    }
  })
  expect(resultado).toBe('ok')
  await expect(page.locator('input[name="cpf"]')).toHaveValue('529.982.247-25')
})
