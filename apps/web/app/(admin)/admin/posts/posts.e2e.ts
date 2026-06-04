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
const posts = [
  {
    filename: 'husky.mdx',
    slug: 'como-usar-husky',
    title: 'Como usar o Husky',
    draft: false,
    publishedAt: '2025-04-28',
    readingTimeMinutes: 5,
  },
  {
    filename: 'wsl.mdx',
    slug: 'wsl-pt1',
    title: 'WSL Pt.1',
    draft: true,
    publishedAt: '2025-02-05',
    readingTimeMinutes: 4,
  },
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
        posts: 2,
        drafts: 1,
        published: 1,
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
}

test('lists posts and links to the editor', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/posts', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ posts }),
    }),
  )
  await page.goto('/admin/posts')
  await expect(page.getByText('Como usar o Husky')).toBeVisible()
  await expect(page.getByText('Rascunho')).toBeVisible()
  await expect(page.getByRole('link', { name: '+ Novo post' })).toBeVisible()
})
