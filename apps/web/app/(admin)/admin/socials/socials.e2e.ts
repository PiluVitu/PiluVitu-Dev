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
const social = {
  key: 'github',
  order: 0,
  socialDescription: 'Acesse o meu Github',
  socialLink: 'https://github.com/PiluVitu',
  iconMode: 'fontawesome',
  fontawesomeIcon: 'brands__github',
  image: '',
  altImage: 'GH',
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

test('lists socials and opens the create modal', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/content/socials', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [{ slug: 'github', data: social }] }),
    }),
  )
  await page.goto('/admin/socials')
  await expect(page.getByText('Acesse o meu Github')).toBeVisible()
  await page.getByRole('button', { name: '+ Nova rede' }).click()
  await expect(page.getByRole('heading', { name: 'Nova rede' })).toBeVisible()
})

test('creates a social (asserts POST body)', async ({ page }) => {
  await baseMocks(page)
  let posted: unknown = null
  await page.route('**/api/admin/content/socials', async (r) => {
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON()
      return r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'x', data: {} }),
      })
    }
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [] }),
    })
  })
  await page.goto('/admin/socials')
  await page.getByRole('button', { name: '+ Nova rede' }).click()
  await page.getByLabel('Descrição / CTA').first().fill('Meu Mastodon')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(() => (posted as { socialDescription?: string })?.socialDescription)
    .toBe('Meu Mastodon')
})
