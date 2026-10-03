import { test, expect, type Page } from '@playwright/test'
import { join } from 'node:path'
import {
  itemParaProject,
  itensListados,
  selecionarParaHome,
} from '../../lib/pilulabs'
import { lerItensDoConteudo } from '../../lib/pilulabs-conteudo'

// O esperado sai do mesmo YAML que a home lê: muda o destaque ou a data pelo
// /admin/pilulabs, e o teste acompanha.
const itens = lerItensDoConteudo(join(__dirname, '..', '..'))
const listados = itensListados(itens)
const naHome = selecionarParaHome(itens)

test.describe('Home V2', () => {
  test('mostra perfil, seções e abre o modal de carreira', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: /Paulo Victor/i }),
    ).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Carreira' })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'PiluLabs' }),
    ).toBeVisible()
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

  test('anônimo/back-off: mostra /tools e /tasks (offline), esconde /votação e admin', async ({
    page,
  }) => {
    await page.route('**/auth/me', (r) =>
      r.fulfill(meEnvelope(null, false, 401)),
    )
    await page.goto('/')
    await expect(page.getByRole('link', { name: '/tools' })).toBeVisible()
    await expect(page.getByRole('link', { name: '/tasks' })).toBeVisible()
    await expect(page.getByRole('link', { name: '/votação' })).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'admin', exact: true }),
    ).toHaveCount(0)
  })

  test('logado não-admin: mostra /votação e /tasks, esconde admin', async ({
    page,
  }) => {
    await page.route('**/auth/me', (r) =>
      r.fulfill(meEnvelope({ ...admin, is_admin: false })),
    )
    await page.goto('/')
    await expect(page.getByRole('link', { name: '/votação' })).toBeVisible()
    await expect(page.getByRole('link', { name: '/tasks' })).toBeVisible()
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

test.describe('PiluLabs na home (segue content/pilulabs)', () => {
  const secao = (page: Page) =>
    page.locator('section[aria-labelledby="pilulabs-heading"]')

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

  test('até 4 cards, na ordem de selecionarParaHome, e a contagem dos listados', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(secao(page).locator('#pilulabs-heading + span')).toHaveText(
      String(listados.length).padStart(2, '0'),
    )
    await expect(secao(page).getByRole('heading', { level: 3 })).toHaveText(
      naHome.map((item) => item.nome),
    )
  })

  test('cada "Acessar" leva ao link do item', async ({ page }) => {
    await page.goto('/')
    const hrefs = await secao(page)
      .getByRole('link', { name: 'Acessar', exact: true })
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')))
    expect(hrefs).toEqual(
      naHome.map((item) => itemParaProject(item).deployLink).filter(Boolean),
    )
  })

  test('"Saiba mais no PiluLabs" leva à vitrine', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Saiba mais no PiluLabs' }).click()
    await expect(page).toHaveURL('/pilulabs')
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
    ).toBeVisible()
  })
})
