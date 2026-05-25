import { test, expect, type Page } from '@playwright/test'

// Routes are matched host-agnostically (`**/path`) so the mocks apply
// regardless of NEXT_PUBLIC_API_URL (localhost:8080 in CI, 8081 in dev, the
// tunnel host in prod). Hardcoding the host here previously broke the suite
// when the API port changed.

type Notification = {
  type: 'error' | 'warning' | 'success' | 'info'
  code?: string
  message: string
}

// envelope mirrors the Go internal/httpx response shape so the mocked API
// matches production: { ok, data, notifications }.
function envelope(data: unknown, notifications: Notification[] = []) {
  return JSON.stringify({ ok: true, data, notifications })
}

function errorEnvelope(code: string, message: string) {
  return JSON.stringify({
    ok: false,
    data: null,
    notifications: [{ type: 'error', code, message }],
  })
}

const mockUser = {
  id: 1,
  email: 'admin@example.com',
  name: 'Admin',
  picture: '',
  is_admin: true,
}

const mockSession = {
  ID: 1,
  Title: 'Sexta 22/05',
  Status: 'open' as const,
  CreatedBy: 1,
  CreatedAt: new Date().toISOString(),
  ClosedAt: null,
  WinnerMovieID: null,
  SortOptionsJSON: '{}',
}

const mockMovies = [
  {
    ID: 1,
    SessionID: 1,
    Category: 'terror',
    Title: 'A Coisa',
    Type: 'filme' as const,
    PosterURL: '',
    TMDbID: 550,
    WasWatched: false,
    SheetNumber: 1,
  },
  {
    ID: 2,
    SessionID: 1,
    Category: 'drama',
    Title: 'Forrest Gump',
    Type: 'filme' as const,
    PosterURL: '',
    TMDbID: 13,
    WasWatched: false,
    SheetNumber: 2,
  },
]

interface MockOptions {
  loggedIn?: boolean
  hasVoted?: boolean
  sessionStatus?: 'open' | 'closed'
}

async function mockAPI(page: Page, options: MockOptions = {}) {
  const { loggedIn = true, hasVoted = false, sessionStatus = 'open' } = options

  await page.route(`**/auth/me`, (route) => {
    if (loggedIn) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(mockUser),
      })
    } else {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: errorEnvelope('not_authenticated', 'Você precisa estar logado.'),
      })
    }
  })
  await page.route(`**/votacao/sessions`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        sessions: [{ ...mockSession, Status: sessionStatus }],
      }),
    })
  })
  await page.route(`**/votacao/sessions/1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        session: { ...mockSession, Status: sessionStatus },
        movies: mockMovies,
        has_voted: hasVoted,
        voted_movie_id: hasVoted ? mockMovies[0].ID : null,
      }),
    })
  })
  await page.route(`**/votacao/sessions/1/votes`, (route) => {
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: envelope(null, [{ type: 'success', message: 'Voto registrado.' }]),
    })
  })
  await page.route(`**/votacao/sessions/1/results`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        results: [
          { movie_id: 1, count: 2 },
          { movie_id: 2, count: 1 },
        ],
        total_votes: 3,
      }),
    })
  })
}

test.describe('/votacao listing', () => {
  test('shows login button when anonymous', async ({ page }) => {
    await mockAPI(page, { loggedIn: false })
    await page.goto('/votacao')
    await expect(
      page.getByRole('link', { name: /entrar com google/i }),
    ).toBeVisible()
  })

  test('lists sessions and links to detail', async ({ page }) => {
    await mockAPI(page)
    await page.goto('/votacao')
    await expect(page.getByText('Sexta 22/05')).toBeVisible()
    await page.getByText('Sexta 22/05').click()
    await expect(page).toHaveURL(/\/votacao\/1$/)
  })

  test('admin sees painel link', async ({ page }) => {
    await mockAPI(page)
    await page.goto('/votacao')
    await expect(
      page.getByRole('link', { name: /painel admin/i }),
    ).toBeVisible()
  })
})

test.describe('/votacao/[id] detail', () => {
  test('renders movies and submits vote (happy path)', async ({ page }) => {
    await mockAPI(page)
    await page.goto('/votacao/1')
    await expect(page.getByText('A Coisa')).toBeVisible()
    await expect(page.getByText('Forrest Gump')).toBeVisible()
    await page.getByText('A Coisa').click()
    await page.getByRole('button', { name: /votar/i }).click()
    await expect(page.getByText(/voto registrado/i)).toBeVisible({
      timeout: 5_000,
    })
  })

  test('hides vote button and highlights the voted movie when already voted', async ({
    page,
  }) => {
    await mockAPI(page, { hasVoted: true })
    await page.goto('/votacao/1')
    // Banner names the chosen movie (mockMovies[0] = "A Coisa").
    await expect(page.getByText(/você votou em "A Coisa"/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^votar$/i })).toHaveCount(0)
    // The chosen card carries the "Seu voto" badge.
    await expect(page.getByText('Seu voto')).toBeVisible()
  })

  test('shows results when session is closed', async ({ page }) => {
    await mockAPI(page, { sessionStatus: 'closed' })
    await page.goto('/votacao/1')
    await expect(page.getByText(/resultados/i)).toBeVisible()
    await expect(page.getByText(/total de votos/i)).toBeVisible()
  })
})
