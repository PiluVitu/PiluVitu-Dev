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
const post = {
  filename: 'wsl.mdx',
  slug: 'wsl-pt1',
  title: 'WSL Pt.1',
  draft: true,
  publishedAt: '2025-02-05',
  readingTimeMinutes: 4,
  frontmatter: {
    title: 'WSL Pt.1',
    slug: 'wsl-pt1',
    excerpt: '',
    coverImage: '',
    tags: [],
    publishedAt: '2025-02-05',
    draft: true,
    readingTimeMinutes: 0,
  },
  body: '# WSL\n\nconteúdo',
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
        posts: 1,
        drafts: 1,
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
  // Preview returns 502 so MdxPreview shows the error state (avoids client MDXRemote rendering a fake serialized result).
  await page.route('**/api/admin/posts/preview', (r) =>
    r.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'preview_error', message: 'preview off in test' },
      }),
    }),
  )
}

test('loads the editor and saves an edited title (asserts PUT body)', async ({
  page,
}) => {
  await baseMocks(page)
  let put: unknown = null
  // exact-slug glob so it does NOT also match /api/admin/posts/preview
  await page.route('**/api/admin/posts/wsl-pt1', async (r) => {
    if (r.request().method() === 'PUT') {
      put = r.request().postDataJSON()
      return r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'wsl-pt1' }),
      })
    }
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ post }),
    })
  })

  await page.goto('/admin/posts/wsl-pt1')
  // the frontmatter form loads with the post's title
  const titulo = page.getByLabel('Título').first()
  await expect(titulo).toHaveValue('WSL Pt.1')
  await titulo.fill('WSL Pt.1 — Editado')
  await page.getByRole('button', { name: /salvar altera/i }).click()
  await expect
    .poll(
      () => (put as { frontmatter?: { title?: string } })?.frontmatter?.title,
    )
    .toBe('WSL Pt.1 — Editado')
})

test('alterna abas e mostra os cards da sidebar', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/posts/wsl-pt1', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ post }),
    }),
  )
  await page.goto('/admin/posts/wsl-pt1')

  await expect(page.getByLabel('Título').first()).toHaveValue('WSL Pt.1')

  // abas
  await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible()
  await page.getByRole('button', { name: 'Pré-visualizar' }).click()
  await page.getByRole('button', { name: 'Dividir' }).click()
  await page.getByRole('button', { name: 'Editar' }).click()

  // cards da sidebar
  await expect(page.getByText('Publicação')).toBeVisible()
  await expect(page.getByText('Metadados')).toBeVisible()
  await expect(page.getByText('Imagem de capa')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /salvar altera/i }),
  ).toBeVisible()
})
