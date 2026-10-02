import { test, expect, type Page } from '@playwright/test'

function envelope(data: unknown) {
  return JSON.stringify({ ok: true, data, notifications: [] })
}

const admin = {
  id: 1,
  email: 'a@x',
  name: 'Paulo',
  picture: '',
  is_admin: true,
}

const botai = {
  slug: 'botai',
  order: 0,
  nome: 'Botaí',
  subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  descricao: 'Extensão que preenche formulários.',
  tipo: 'extensao',
  tags: ['QA'],
  logo: '',
  sigla: '',
  site: 'https://botai.pilutech.com.br',
  repo: '',
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  destaque: true,
  data: '2026-10-01',
  listado: true,
  paginaPropria: true,
}

async function baseMocks(page: Page) {
  await page.route('**/auth/me', (r) =>
    r.fulfill({ contentType: 'application/json', body: envelope(admin) }),
  )
  await page.route('**/votacao/sessions', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ sessions: [] }),
    }),
  )
  await page.route('**/api/admin/stats', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        posts: 0,
        drafts: 0,
        published: 0,
        pilulabs: 1,
        careers: 0,
        careersCurrent: 0,
        recentPosts: [],
      }),
    }),
  )
  await page.route('**/api/admin/github/status', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ linked: true, login: 'piluvitu' }),
    }),
  )
}

async function mockarLista(
  page: Page,
  entries: unknown[],
  aoPostar: (corpo: Record<string, unknown>) => void = () => {},
) {
  await page.route('**/api/admin/content/pilulabs', async (r) => {
    if (r.request().method() === 'POST') {
      aoPostar(r.request().postDataJSON() as Record<string, unknown>)
      return r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'meu-app', data: {} }),
      })
    }
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries }),
    })
  })
}

test('lista os itens, com PiluLabs na sidebar, e abre o modal de criação', async ({
  page,
}) => {
  await baseMocks(page)
  await mockarLista(page, [{ slug: 'botai', data: botai }])
  await page.goto('/admin/pilulabs')
  await expect(page.getByText('Botaí', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^PiluLabs/ })).toHaveAttribute(
    'href',
    '/admin/pilulabs',
  )
  await expect(page.getByRole('link', { name: /^Projetos/ })).toHaveCount(0)
  await page.getByRole('button', { name: '+ Novo item' }).click()
  await expect(page.getByRole('heading', { name: 'Novo item' })).toBeVisible()
})

test('cria um item: o POST leva os campos do formulário', async ({ page }) => {
  await baseMocks(page)
  let postado: Record<string, unknown> | null = null
  await mockarLista(page, [], (corpo) => {
    postado = corpo
  })
  await page.goto('/admin/pilulabs')
  await page.getByRole('button', { name: '+ Novo item' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Meu App')
  // O texto do <label> do select inclui as opções: getByLabel não o acha.
  await page
    .getByRole('combobox', { name: 'Tipo', exact: true })
    .selectOption('mobile')
  await page.getByLabel('Lançamento', { exact: true }).fill('2026-09-30')
  await page.getByRole('switch', { name: 'Listado', exact: true }).click()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(() => postado)
    .toMatchObject({
      slug: 'meu-app',
      nome: 'Meu App',
      tipo: 'mobile',
      data: '2026-09-30',
      listado: true,
      destaque: false,
      paginaPropria: false,
    })
})

test('site sem https não sai do formulário', async ({ page }) => {
  await baseMocks(page)
  let postou = false
  await mockarLista(page, [], () => {
    postou = true
  })
  await page.goto('/admin/pilulabs')
  await page.getByRole('button', { name: '+ Novo item' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Meu App')
  await page.getByLabel('Site', { exact: true }).fill('http://meu-app.com')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Use uma URL https://')).toBeVisible()
  expect(postou).toBe(false)
})

test('edita: o modal abre com os dados do item', async ({ page }) => {
  await baseMocks(page)
  await mockarLista(page, [{ slug: 'botai', data: botai }])
  await page.goto('/admin/pilulabs')
  // A linha arrastável também é um role=button, cujo nome contém o item.
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Editar item' })).toBeVisible()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Botaí')
  await expect(page.getByLabel('Lançamento', { exact: true })).toHaveValue(
    '2026-10-01',
  )
  await expect(
    page.getByRole('switch', { name: 'Listado', exact: true }),
  ).toHaveAttribute('aria-checked', 'true')
})
