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

test('uploads a file via the picker control', async ({ page }) => {
  await baseMocks(page)
  // Single handler: POST → 201 upload response; everything else → list
  await page.route('**/api/admin/media', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ path: '/media/novo.png', filename: 'novo.png' }),
      })
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items }),
    })
  })
  await page.goto('/admin/midia')
  // Wait for the grid to load (existing items visible)
  await expect(page.getByText('capa.png')).toBeVisible()
  // Set the hidden file input — onChange fires fileToUpload → upload mutation → POST
  await page.setInputFiles('input[type=file]', {
    name: 'novo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgo=', 'base64'),
  })
  // Assert success toast
  await expect(page.getByText('Imagem enviada')).toBeVisible()
})

test('deletes a media item after confirmation', async ({ page }) => {
  await baseMocks(page)
  // List handler (bare path, no trailing segment)
  await page.route('**/api/admin/media', (route) => {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items }),
    })
  })
  // DELETE handler (path has a segment: /api/admin/media/<filename>)
  await page.route('**/api/admin/media/*', (route) => {
    if (route.request().method() === 'DELETE') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name: 'capa.png', deleted: true }),
      })
    }
    return route.continue()
  })
  await page.goto('/admin/midia')
  // Wait for items to render
  await expect(page.getByText('capa.png')).toBeVisible()
  // Click the "Apagar" button on the first card (capa.png is first in items)
  await page.getByRole('button', { name: 'Apagar' }).first().click()
  // DeleteConfirmDialog opens — click the destructive "Remover" button
  await page.getByRole('button', { name: 'Remover' }).click()
  // Assert success toast
  await expect(page.getByText('Removida')).toBeVisible()
})
