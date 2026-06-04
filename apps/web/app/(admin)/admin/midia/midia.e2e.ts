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
const items = [
  { filename: 'capa.png', path: '/media/capa.png', size: 120000, sha: 's1' },
  { filename: 'avatar.jpg', path: '/media/avatar.jpg', size: 50000, sha: 's2' },
]

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
  await page.route('https://raw.githubusercontent.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') }),
  )
}

test('lists media and shows the upload control', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/media', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items }),
    }),
  )
  await page.goto('/admin/midia')
  await expect(page.getByText('capa.png')).toBeVisible()
  await expect(page.getByText('avatar.jpg')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '+ Enviar arquivo' }),
  ).toBeVisible()
})
