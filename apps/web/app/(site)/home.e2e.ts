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

test.describe('Footer — links gateados por auth', () => {
  const meEnvelope = (data: unknown, ok = true, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ ok, data, notifications: [] }),
  })
  const admin = {
    id: 1,
    email: 'a@x',
    name: 'Paulo',
    picture: '',
    is_admin: true,
  }

  test('anônimo: esconde /votação e admin (só /tools)', async ({ page }) => {
    await page.route('**/auth/me', (r) =>
      r.fulfill(meEnvelope(null, false, 401)),
    )
    await page.goto('/')
    await expect(page.getByRole('link', { name: '/tools' })).toBeVisible()
    await expect(page.getByRole('link', { name: '/votação' })).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'admin', exact: true }),
    ).toHaveCount(0)
  })

  test('logado não-admin: mostra /votação, esconde admin', async ({ page }) => {
    await page.route('**/auth/me', (r) =>
      r.fulfill(meEnvelope({ ...admin, is_admin: false })),
    )
    await page.goto('/')
    await expect(page.getByRole('link', { name: '/votação' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'admin', exact: true }),
    ).toHaveCount(0)
  })

  test('admin logado: mostra /votação e admin', async ({ page }) => {
    await page.route('**/auth/me', (r) => r.fulfill(meEnvelope(admin)))
    await page.goto('/')
    await expect(page.getByRole('link', { name: '/votação' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'admin', exact: true }),
    ).toBeVisible()
  })
})
