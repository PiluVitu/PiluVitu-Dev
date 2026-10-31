import { test, expect, type Locator, type Page } from '@playwright/test'

// Lê a animação que o navegador de fato aplicou: é o único jeito de provar que
// as classes do design system viram movimento e que prefers-reduced-motion
// troca o deslize/zoom por um fade curto.
async function animacao(el: Locator) {
  return el.evaluate((n) => {
    const s = getComputedStyle(n)
    return {
      nome: s.animationName,
      duracao: parseFloat(s.animationDuration) * 1000,
    }
  })
}

test.describe('movimento do design system', () => {
  test('o menu de tema abre com entrada animada', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Tema' }).first().click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()

    const a = await animacao(menu)
    expect(a.nome).toBe('ui-entrar')
    expect(a.duracao).toBeGreaterThanOrEqual(150)
    expect(a.duracao).toBeLessThanOrEqual(300)
  })

  test('com prefers-reduced-motion o menu só faz um fade curto', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Tema' }).first().click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()

    const a = await animacao(menu)
    expect(a.nome).toBe('ui-entrar-reduzido')
    expect(a.duracao).toBeLessThanOrEqual(150)
  })

  test('o modal de carreira abre com zoom e fecha com saída', async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('heading', { name: 'Carreira' })
      .scrollIntoViewIfNeeded()
    const cartao = page
      .locator('section', {
        has: page.getByRole('heading', { name: 'Carreira' }),
      })
      .getByRole('button')
      .first()
    await cartao.click()
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    expect((await animacao(modal)).nome).toBe('ui-entrar')

    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
  })
})

// Conta as chamadas reais à View Transitions API do Chrome, sem trocá-la.
async function espiarViewTransition(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __transicoes: number }
    w.__transicoes = 0
    const original = document.startViewTransition?.bind(document)
    if (!original) return
    document.startViewTransition = ((...args: Parameters<typeof original>) => {
      w.__transicoes++
      return original(...args)
    }) as typeof document.startViewTransition
  })
}

async function escolherTemaClaro(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Tema' }).first().click()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await page.getByRole('menuitem', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  return page.evaluate(
    () => (window as unknown as { __transicoes: number }).__transicoes,
  )
}

test.describe('troca de tema', () => {
  test('passa por uma View Transition', async ({ page }) => {
    await espiarViewTransition(page)
    expect(await escolherTemaClaro(page)).toBe(1)
  })

  test('com prefers-reduced-motion troca sem transição', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await espiarViewTransition(page)
    expect(await escolherTemaClaro(page)).toBe(0)
  })
})
