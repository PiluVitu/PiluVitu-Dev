import { test, expect, type Page } from '@playwright/test'
import { serialize } from 'next-mdx-remote/serialize'

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
        pilulabs: 0,
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

// Razão de contraste do WCAG 2.x entre a cor do texto e o fundo efetivo (os fundos
// translúcidos dos ancestrais são compostos até o primeiro opaco). As cores passam por
// um canvas para virar sRGB, porque o Tailwind 4 e o typography usam oklch.
function contrasteDosTextos(seletor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const rgba = (cor: string) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = cor
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const sobre = (de: number[], fundo: number[]) =>
    [0, 1, 2].map((i) => de[i] * de[3] + fundo[i] * (1 - de[3]))
  const fundoDe = (el: Element) => {
    const camadas: number[][] = []
    for (let no: Element | null = el; no; no = no.parentElement) {
      const cor = rgba(getComputedStyle(no).backgroundColor)
      if (cor[3] > 0) camadas.push(cor)
      if (cor[3] >= 1) break
    }
    return camadas.reduceRight(
      (fundo, camada) => sobre(camada, fundo),
      [255, 255, 255],
    )
  }
  const luminancia = (rgb: number[]) => {
    const [r, g, b] = rgb.map((c) => {
      const v = c / 255
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return [...document.querySelectorAll(seletor)].map((el) => {
    const fundo = fundoDe(el)
    const texto = sobre(rgba(getComputedStyle(el).color), fundo)
    const [claro, escuro] = [luminancia(texto), luminancia(fundo)].sort(
      (a, b) => b - a,
    )
    return {
      tag: el.tagName.toLowerCase(),
      razao: Math.round(((claro + 0.05) / (escuro + 0.05)) * 100) / 100,
    }
  })
}

for (const tema of ['light', 'dark'] as const)
  test(`a pré-visualização passa de 4,5:1 no tema ${tema}`, async ({
    page,
  }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
    await baseMocks(page)
    await page.route('**/api/admin/posts/wsl-pt1', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ post }),
      }),
    )
    const serialized = await serialize(
      '# Título\n\nUm parágrafo com **negrito**.\n\n## Seção\n\n- um item da lista',
    )
    await page.route('**/api/admin/posts/preview', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ serialized }),
      }),
    )
    await page.goto('/admin/posts/wsl-pt1')
    await page.getByRole('button', { name: 'Pré-visualizar' }).click()
    await expect(page.locator('.prose h2')).toHaveText('Seção')

    const medidas = await page.evaluate(
      contrasteDosTextos,
      '.prose :is(h1, h2, p, strong, li)',
    )
    expect(medidas.map((m) => m.tag).sort()).toEqual([
      'h1',
      'h2',
      'li',
      'p',
      'strong',
    ])
    expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
  })
