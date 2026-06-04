import { test, expect, type Page } from '@playwright/test'

function envelope(data: unknown) {
  return JSON.stringify({ ok: true, data, notifications: [] })
}

const adminUser = {
  id: 1,
  email: 'a@x.com',
  name: 'Paulo Victor',
  picture: '',
  is_admin: true,
}
const nonAdmin = { ...adminUser, is_admin: false }

const statsBody = {
  posts: 6,
  drafts: 1,
  published: 5,
  projects: 1,
  careers: 5,
  careersCurrent: 2,
  recentPosts: [
    {
      slug: 'como-usar-husky',
      title: 'Como usar o Husky',
      draft: false,
      readingTimeMinutes: 5,
      publishedAt: '2025-04-28',
    },
  ],
}

async function mockCommon(page: Page, opts: { linked: boolean }) {
  await page.route('**/votacao/sessions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope({
        sessions: [
          {
            ID: 1,
            Title: 'S1',
            Status: 'open',
            CreatedBy: 1,
            CreatedAt: '2025-01-01',
            ClosedAt: null,
            WinnerMovieID: null,
            WinnerMethod: null,
            SortOptionsJSON: '{}',
          },
          {
            ID: 2,
            Title: 'S2',
            Status: 'closed',
            CreatedBy: 1,
            CreatedAt: '2025-01-02',
            ClosedAt: '2025-01-03',
            WinnerMovieID: 3,
            WinnerMethod: 'votes',
            SortOptionsJSON: '{}',
          },
        ],
      }),
    }),
  )
  await page.route('**/api/admin/stats', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(statsBody),
    }),
  )
  await page.route('**/api/admin/github/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        linked: opts.linked,
        login: opts.linked ? 'piluvitu' : null,
      }),
    }),
  )
}

test('not authenticated shows the Google login screen', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        data: null,
        notifications: [
          { type: 'error', code: 'not_authenticated', message: 'Logue.' },
        ],
      }),
    }),
  )
  await mockCommon(page, { linked: false })
  await page.goto('/admin')
  await expect(
    page.getByRole('link', { name: /entrar com google/i }),
  ).toBeVisible()
})

test('non-admin sees access denied', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(nonAdmin),
    }),
  )
  await mockCommon(page, { linked: false })
  await page.goto('/admin')
  await expect(page.getByText('Acesso negado')).toBeVisible()
})

test('admin sees the dashboard with stat cards and recent posts', async ({
  page,
}) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await mockCommon(page, { linked: false })
  await page.goto('/admin')
  await expect(
    page.getByRole('heading', { name: /Bem-vindo de volta, Paulo/ }),
  ).toBeVisible()
  await expect(
    page.getByText('Sessões de votação', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Como usar o Husky', { exact: true }),
  ).toBeVisible()
  // GitHub not linked → connect CTA
  await expect(
    page.getByRole('link', { name: 'Conectar GitHub' }),
  ).toBeVisible()
})

test('account menu shows the connected GitHub status', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await mockCommon(page, { linked: true })
  await page.goto('/admin')
  // Conectado → o banner do dashboard NÃO aparece; o status vive no menu de conta.
  await expect(page.getByRole('link', { name: 'Conectar GitHub' })).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Menu da conta' }).click()
  await expect(page.getByText('Conectado como')).toBeVisible()
  await expect(page.getByText('@piluvitu', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Desconectar' })).toBeVisible()
})

test('account menu shows identity, disconnected status and logout', async ({
  page,
}) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await mockCommon(page, { linked: false })
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Menu da conta' }).click()
  await expect(page.getByText('a@x.com', { exact: true })).toBeVisible()
  await expect(page.getByText('Não conectado')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Sair' })).toBeVisible()
})
