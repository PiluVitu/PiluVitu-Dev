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
const project = {
  projectSlug: 'live-prs',
  order: 0,
  projectName: 'Live PRs',
  subtitle: 'agregador',
  projectLogo: '',
  description: '',
  tags: [],
  deployLink: '',
  repoLink: '',
  image: '',
  altImage: '',
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
        projects: 1,
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

test('lists projects and opens the create modal', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/content/projects', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [{ slug: 'live-prs', data: project }] }),
    }),
  )
  await page.goto('/admin/projetos')
  await expect(page.getByText('Live PRs')).toBeVisible()
  await page.getByRole('button', { name: '+ Novo projeto' }).click()
  await expect(
    page.getByRole('heading', { name: 'Novo projeto' }),
  ).toBeVisible()
})

test('creates a project (asserts POST body)', async ({ page }) => {
  await baseMocks(page)
  let posted: unknown = null
  await page.route('**/api/admin/content/projects', async (r) => {
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON()
      return r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'meu-app', data: {} }),
      })
    }
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [] }),
    })
  })
  await page.goto('/admin/projetos')
  await page.getByRole('button', { name: '+ Novo projeto' }).click()
  // Try getByLabel first; fall back to label-wrapped input if needed
  const nameInput =
    page.getByLabel('Nome').first() ||
    page.locator('label:has-text("Nome") input')
  await nameInput.fill('Meu App')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(() => (posted as { projectName?: string })?.projectName)
    .toBe('Meu App')
})
