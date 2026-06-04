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

test('linked GitHub shows the connected banner', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await mockCommon(page, { linked: true })
  await page.goto('/admin')
  await expect(page.getByText('@piluvitu', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Desconectar' })).toBeVisible()
})
