import { test, expect, type Page } from '@playwright/test'

// Routes matched host-agnostically so mocks apply regardless of
// NEXT_PUBLIC_API_URL (localhost:8080 in CI, 8081 in dev, tunnel in prod).
// Pattern mirrors votacao.e2e.ts and editor.e2e.ts.

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

// Mock targets returned by /admin/distribution/proposals
const pendingTargets = [
  {
    slug: 'meu-post',
    platform: 'devto',
    kind: 'article_crosspost',
    content: 'corpo do artigo para dev.to',
    status: 'pending',
    remote_url: '',
    error: '',
  },
  {
    slug: 'meu-post',
    platform: 'bluesky',
    kind: 'social_hook',
    content: 'chamada bsky curta',
    status: 'pending',
    remote_url: '',
    error: '',
  },
]

// Same targets but with status=posted after publish
const postedTargets = [
  {
    slug: 'meu-post',
    platform: 'devto',
    kind: 'article_crosspost',
    content: 'corpo do artigo para dev.to',
    status: 'posted',
    remote_url: 'https://dev.to/piluvitu/meu-post',
    error: '',
  },
  {
    slug: 'meu-post',
    platform: 'bluesky',
    kind: 'social_hook',
    content: 'chamada bsky curta',
    status: 'posted',
    remote_url: 'https://bsky.app/profile/piluvitu.bsky.social/post/abc',
    error: '',
  },
]

// Base admin mocks required by the admin layout/topbar (auth, sidebar queries).
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
  // Preview endpoint: return 502 so MdxPreview shows the error state
  // (avoids needing a real MDX serialisation in test context).
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

test.describe('Atelier — ProofreadButton', () => {
  // The /admin/posts/novo page is a pure client component (no server-side
  // GitHub fetch). Reachable with only the Go API mocked.

  test('corrige o texto, abre o diff e aplica a correção', async ({ page }) => {
    await baseMocks(page)

    // Mock the proofread endpoint: Go API tunnelled at any host.
    await page.route('**/admin/llm/proofread', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: envelope({ corrected: 'Texto corrigido pela IA.' }),
      }),
    )

    await page.goto('/admin/posts/novo')

    // The editor renders with an initial body ("# Novo post\n\n").
    // "Corrigir texto" is enabled when body is non-empty.
    await expect(
      page.getByRole('button', { name: /corrigir texto/i }),
    ).toBeVisible()

    // The "Revisão cuidadosa" checkbox must be present next to the button.
    await expect(page.getByText(/revisão cuidadosa/i)).toBeVisible()

    // Click — triggers POST /admin/llm/proofread
    await page.getByRole('button', { name: /corrigir texto/i }).click()

    // Diff dialog should open with title "Revisão da IA"
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await expect(
      page.getByRole('heading', { name: /revisão da ia/i }),
    ).toBeVisible()

    // New layout: a corrections list ("N correções") summarises what the LLM
    // changed (antes → depois), with the full inline diff collapsed behind
    // "ver texto completo".
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/correç(ão|ões)/i)).toBeVisible()
    // "corrigido" appears as an after-word (green) in the corrections list.
    await expect(dialog.locator('span', { hasText: 'corrigido' })).toBeVisible()
    // Each correction has an accept/reject checkbox (granular control).
    await expect(dialog.getByRole('checkbox').first()).toBeVisible()
    // Expanding reveals the full inline diff pane.
    await dialog.getByRole('button', { name: /ver texto completo/i }).click()
    await expect(
      dialog.getByRole('button', { name: /ocultar texto completo/i }),
    ).toBeVisible()

    // Click "Aplicar (N)" to apply the accepted corrections
    await page.getByRole('button', { name: /aplicar/i }).click()

    // Dialog closes and a success toast appears
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/correções aplicadas/i)).toBeVisible({
      timeout: 5_000,
    })
  })

  test('rejeita a correção e fecha o dialog sem aplicar', async ({ page }) => {
    await baseMocks(page)

    await page.route('**/admin/llm/proofread', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: envelope({ corrected: 'Versão que será rejeitada.' }),
      }),
    )

    await page.goto('/admin/posts/novo')

    await page.getByRole('button', { name: /corrigir texto/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })

    // Click "Cancelar" — dialog closes without applying
    await page.getByRole('button', { name: /cancelar/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })
    // No success toast
    await expect(page.getByText(/correções aplicadas/i)).not.toBeVisible()
  })
})

test.describe('Atelier — DistributionPanel', () => {
  // The DistributionPanel card is gated on fm.slug being truthy.
  // In "novo" (create) mode the slug field is editable — fill it to reveal
  // the panel. The slug input is inside PostMetaCard → SidebarCard("Metadados").

  test('gera propostas, exibe dev.to e Bluesky e publica', async ({ page }) => {
    await baseMocks(page)

    await page.route('**/admin/distribution/proposals', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: envelope({ targets: pendingTargets }),
      }),
    )

    // /admin/distribution/<slug>/publish — wildcard for any slug
    await page.route('**/admin/distribution/*/publish', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: envelope({ targets: postedTargets }),
      }),
    )

    await page.goto('/admin/posts/novo')

    // Fill the slug field to trigger DistributionPanel mount
    const slugInput = page.getByLabel('Slug')
    await expect(slugInput).toBeVisible()
    await slugInput.fill('meu-post')
    // Blur to commit value
    await slugInput.blur()

    // The Distribuição card should now be visible
    await expect(page.getByText('Distribuição')).toBeVisible()

    // "Gerar propostas" button appears before proposals are loaded
    await expect(
      page.getByRole('button', { name: /gerar propostas/i }),
    ).toBeVisible()

    // Click to fetch proposals
    await page.getByRole('button', { name: /gerar propostas/i }).click()

    // Both platforms should render in the panel
    await expect(page.getByText('dev.to')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Bluesky')).toBeVisible({ timeout: 5_000 })

    // "Publicar selecionadas" button appears once proposals are loaded
    await expect(
      page.getByRole('button', { name: /publicar selecionadas/i }),
    ).toBeVisible()

    // Click to publish
    await page.getByRole('button', { name: /publicar selecionadas/i }).click()

    // After publish, posted links (✅ publicado) should appear
    await expect(page.getByText('✅ publicado').first()).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByText('Publicação concluída.')).toBeVisible({
      timeout: 5_000,
    })

    // The posted remote URLs should be rendered as links
    await expect(
      page.getByRole('link', { name: /✅ publicado/i }).first(),
    ).toBeVisible()
  })
})
