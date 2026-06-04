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
const carreira = {
  orgSlug: 'aride',
  order: 0,
  orgName: 'Aride',
  orgDescription: '',
  orgLink: '',
  image: '',
  altImage: 'AR',
  title: 'Software Developer',
  location: 'Remoto',
  date: 'Mar 2024',
  atribuitions: [],
  current: true,
  tags: [],
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
        projects: 0,
        careers: 1,
        careersCurrent: 1,
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

test('lists carreiras and opens the create modal', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/content/carreiras', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [{ slug: 'aride', data: carreira }] }),
    }),
  )
  await page.goto('/admin/carreira')
  await expect(page.getByText('Aride')).toBeVisible()
  await page.getByRole('button', { name: '+ Nova experiência' }).click()
  await expect(
    page.getByRole('heading', { name: 'Nova experiência' }),
  ).toBeVisible()
})

test('creates a carreira (asserts POST body)', async ({ page }) => {
  await baseMocks(page)
  let posted: unknown = null
  await page.route('**/api/admin/content/carreiras', async (r) => {
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON()
      return r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'nova', data: {} }),
      })
    }
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [] }),
    })
  })
  await page.goto('/admin/carreira')
  await page.getByRole('button', { name: '+ Nova experiência' }).click()
  await page.getByLabel('Organização').first().fill('Nova Empresa')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(() => (posted as { orgName?: string })?.orgName)
    .toBe('Nova Empresa')
})
