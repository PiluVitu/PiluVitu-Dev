import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { itensListados } from '../../lib/pilulabs'
import { lerItensDoConteudo } from '../../lib/pilulabs-conteudo'

// O link do rodapé segue o mesmo YAML que a home lê.
const listados = itensListados(lerItensDoConteudo(join(__dirname, '..', '..')))

test.describe('Home V2', () => {
  test('mostra perfil, seções e abre o modal de carreira', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: /Paulo Victor/i }),
    ).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Carreira' })).toBeVisible()
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Meus apps agora moram na PiluTech',
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'PiluLabs' }),
    ).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Artigos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Projetos' })).toHaveCount(0)

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

  test('anônimo/back-off: mostra /tools e /tasks (offline), esconde Votaí e admin', async ({
    page,
  }) => {
    await page.route('**/auth/me', (r) =>
      r.fulfill(meEnvelope(null, false, 401)),
    )
    await page.goto('/')
    await expect(page.getByRole('link', { name: '/tools' })).toBeVisible()
    await expect(page.getByRole('link', { name: '/tasks' })).toBeVisible()
    await expect(
      page.locator('footer').getByRole('link', { name: 'Votaí', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'admin', exact: true }),
    ).toHaveCount(0)
  })

  test('logado não-admin: mostra Votaí e /tasks, esconde admin', async ({
    page,
  }) => {
    await page.route('**/auth/me', (r) =>
      r.fulfill(meEnvelope({ ...admin, is_admin: false })),
    )
    await page.goto('/')
    await expect(
      page.locator('footer').getByRole('link', { name: 'Votaí', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: '/tasks' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'admin', exact: true }),
    ).toHaveCount(0)
  })

  test('admin logado: mostra Votaí e admin', async ({ page }) => {
    await page.route('**/auth/me', (r) => r.fulfill(meEnvelope(admin)))
    await page.goto('/')
    await expect(
      page.locator('footer').getByRole('link', { name: 'Votaí', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'admin', exact: true }),
    ).toBeVisible()
  })
})

test.describe('PiluLabs fora da home, no rodapé', () => {
  test('o rodapé só mostra /pilulabs com item listado', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: '/tools' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: '/pilulabs', exact: true }),
    ).toHaveCount(listados.length > 0 ? 1 : 0)
    if (listados.length > 0)
      await expect(
        page.getByRole('link', { name: '/pilulabs', exact: true }),
      ).toHaveAttribute('href', '/pilulabs')
  })
})
