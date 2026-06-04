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
const profile = {
  displayName: 'Paulo Victor Torres Silva',
  avatarSrc: '/profile-2.jpg',
  avatarAlt: 'Paulo',
  roleHighlight: 'SRE',
  companyName: 'Reapho',
  companyLink: '',
  companyLinkColor: '#14b8a6',
  bio: 'bio',
  availabilityOpen: true,
  availabilityLabel: 'Disponível para oportunidades',
  location: 'Brasil · Remoto',
  disciplines: ['SRE'],
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

test('renders the profile form with loaded data', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/content/profile', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: profile }),
    }),
  )
  await page.goto('/admin/perfil')
  await expect(
    page.locator('input[value="Paulo Victor Torres Silva"]'),
  ).toBeVisible()
})

test('saves the profile (asserts PUT body)', async ({ page }) => {
  await baseMocks(page)
  let put: unknown = null
  await page.route('**/api/admin/content/profile', async (r) => {
    if (r.request().method() === 'PUT') {
      put = r.request().postDataJSON()
      return r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: profile }),
      })
    }
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: profile }),
    })
  })
  await page.goto('/admin/perfil')
  await page.getByLabel('Localização').first().fill('Portugal')
  await page.getByRole('button', { name: 'Salvar perfil' }).click()
  await expect
    .poll(() => (put as { location?: string })?.location)
    .toBe('Portugal')
})
