import { test, expect, type Page } from '@playwright/test'

// Rotas casadas host-agnosticamente (`**/path`) → independem de NEXT_PUBLIC_API_URL.
type Notification = {
  type: 'error' | 'warning' | 'success' | 'info'
  code?: string
  message: string
}
function envelope(data: unknown, notifications: Notification[] = []) {
  return JSON.stringify({ ok: true, data, notifications })
}

const adminUser = {
  id: 1,
  email: 'admin@example.com',
  name: 'Admin',
  picture: '',
  is_admin: true,
}
const session = {
  ID: 1,
  Title: 'Sexta 22/05',
  Status: 'open' as const,
  CreatedBy: 1,
  CreatedAt: '2026-05-22T00:00:00.000Z',
  ClosedAt: null,
  WinnerMovieID: null,
  WinnerMethod: null,
  SortOptionsJSON: '{}',
}
const adminUsers = [
  {
    id: 1,
    name: 'Admin',
    email: 'admin@example.com',
    picture: '',
    is_admin: true,
    created_at: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Maria S.',
    email: 'maria@example.com',
    picture: '',
    is_admin: false,
    created_at: '2026-05-02T00:00:00.000Z',
  },
]
const backups = [
  {
    ID: 1,
    DriveFileID: 'f1',
    DriveFileName: 'votacao.db',
    SizeBytes: 1_200_000,
    TriggerType: 'manual' as const,
    CreatedAt: '2026-05-22T03:00:00.000Z',
  },
]
const sessionVotes = [
  {
    user_id: 1,
    user_name: 'Admin',
    user_email: 'admin@example.com',
    movie_id: 1,
    movie_title: 'A Coisa',
    category: 'terror',
    created_at: '2026-05-22T01:00:00.000Z',
  },
]

async function baseMocks(page: Page, opts: { isAdmin?: boolean } = {}) {
  const { isAdmin = true } = opts
  await page.route('**/auth/me', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ ...adminUser, is_admin: isAdmin }),
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
  await page.route('**/votacao/sessions', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ sessions: [session] }),
    }),
  )
  await page.route('**/votacao/sessions/1/votes', (r) => {
    if (r.request().method() === 'GET') {
      r.fulfill({
        contentType: 'application/json',
        body: envelope({ votes: sessionVotes, total: sessionVotes.length }),
      })
      return
    }
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ voted_movie_ids: [] }),
    })
  })
  await page.route('**/votacao/sessions/1', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({
        session,
        movies: [
          {
            ID: 1,
            SessionID: 1,
            Category: 'terror',
            Title: 'A Coisa',
            Type: 'filme',
            PosterURL: '',
            TMDbID: 550,
            WasWatched: false,
            SheetNumber: 1,
          },
        ],
        has_voted: false,
        voted_movie_ids: [],
      }),
    }),
  )
  await page.route('**/admin/users', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ users: adminUsers }),
    }),
  )
  await page.route('**/admin/backups', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ backups }),
    }),
  )
}

test.describe('/admin/sessoes', () => {
  test('mostra as quatro seções do painel pra admin', async ({ page }) => {
    await baseMocks(page)
    await page.goto('/admin/sessoes')
    await expect(page.getByText('Nova sessão')).toBeVisible()
    await expect(page.getByText('Sexta 22/05')).toBeVisible()
    await expect(page.getByText('maria@example.com')).toBeVisible()
    // O painel de backups é SÓ-LEITURA (ver backups-panel.tsx) — não existe
    // botão "disparar backup" (o Worker não tem como fazer isso). O painel
    // mostra o comando real e o histórico já registrado (o fixture
    // `backups` acima tem SizeBytes:1_200_000 -> "1.1 MB").
    await expect(
      page.getByRole('button', { name: /backup/i }),
    ).not.toBeVisible()
    await expect(page.getByText('make backup-ramielle')).toBeVisible()
    await expect(page.getByText('1.1 MB')).toBeVisible()
  })

  test('expande uma sessão pra ver quem votou', async ({ page }) => {
    await baseMocks(page)
    await page.goto('/admin/sessoes')
    await page.getByRole('button', { name: 'Ver votos' }).click()
    await expect(page.getByText('A Coisa')).toBeVisible()
  })

  test('o redirect de /votacao/admin chega em /admin/sessoes', async ({
    page,
  }) => {
    await baseMocks(page)
    await page.goto('/votacao/admin')
    await expect(page).toHaveURL(/\/admin\/sessoes$/)
    await expect(page.getByText('Nova sessão')).toBeVisible()
  })

  test('bloqueia não-admin (gate do shell)', async ({ page }) => {
    await baseMocks(page, { isAdmin: false })
    await page.goto('/admin/sessoes')
    await expect(page.getByText('Acesso negado')).toBeVisible()
  })
})
