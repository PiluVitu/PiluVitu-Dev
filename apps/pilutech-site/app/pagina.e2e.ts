import { expect, test } from '@playwright/test'
import { rgbDoToken } from '../lib/tokens-do-ds'

test('/ responde com o h1', async ({ page }) => {
  const resposta = await page.goto('/')
  expect(resposta?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('PiluTech')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
})

// Review Focus 6: sem o @theme inline do globals.css, o `dark` do <main> não muda a cor (sai Névoa).
test('o elemento com `dark` pega as cores do tema escuro', async ({ page }) => {
  await page.goto('/')
  const cores = await page.locator('main').evaluate((el) => {
    const estilo = getComputedStyle(el)
    return { fundo: estilo.backgroundColor, texto: estilo.color }
  })
  expect(cores).toEqual({
    fundo: rgbDoToken('escuro', 'background'),
    texto: rgbDoToken('escuro', 'foreground'),
  })
})
