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
  WinnerMethod: null,
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

const mockSessionVotes = [
  {
    user_id: 1,
    user_name: 'Admin',
    user_email: 'admin@example.com',
    movie_id: 1,
    movie_title: 'A Coisa',
    category: 'terror',
    created_at: new Date().toISOString(),
  },
]

const mockAdminUsers = [
  {
    id: 1,
    name: 'Admin',
    email: 'admin@example.com',
    picture: '',
    is_admin: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Maria S.',
    email: 'maria@example.com',
    picture: '',
    is_admin: false,
    created_at: new Date().toISOString(),
  },
]

const mockBackups = [
  {
    ID: 1,
    DriveFileID: 'f1',
    DriveFileName: 'votacao.db',
    SizeBytes: 1_200_000,
    TriggerType: 'manual' as const,
    CreatedAt: new Date().toISOString(),
  },
]

interface MockOptions {
  loggedIn?: boolean
  votedMovieIds?: number[]
  sessionStatus?: 'open' | 'closed'
}

async function mockAPI(page: Page, options: MockOptions = {}) {
  const {
    loggedIn = true,
    votedMovieIds = [],
    sessionStatus = 'open',
  } = options

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
        has_voted: votedMovieIds.length > 0,
        voted_movie_ids: votedMovieIds,
      }),
    })
  })
  // Same path serves POST (cast votes) and GET (admin: who voted for what).
  await page.route(`**/votacao/sessions/1/votes`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({
          votes: mockSessionVotes,
          total: mockSessionVotes.length,
        }),
      })
      return
    }
    const body = route.request().postDataJSON() as { movie_ids: number[] }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({ voted_movie_ids: body.movie_ids }, [
        { type: 'success', message: 'Voto registrado.' },
      ]),
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
        total_voters: 3,
      }),
    })
  })
  await page.route(`**/admin/users`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({ users: mockAdminUsers }),
    })
  })
  await page.route(`**/admin/backups`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({ backups: mockBackups }),
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
    ).toHaveAttribute('href', '/admin/sessoes')
  })
})

test.describe('/votacao/[id] detail', () => {
  test('renders movies and submits a single vote (happy path)', async ({
    page,
  }) => {
    await mockAPI(page)
    await page.goto('/votacao/1')
    await expect(page.getByText('A Coisa')).toBeVisible()
    await expect(page.getByText('Forrest Gump')).toBeVisible()
    await page.getByText('A Coisa').click()
    await page.getByRole('button', { name: /votar \(1\)/i }).click()
    await expect(page.getByText(/voto registrado/i)).toBeVisible({
      timeout: 5_000,
    })
  })

  test('approval voting: selects multiple movies and submits', async ({
    page,
  }) => {
    await mockAPI(page)
    // Tighten the vote POST mock so it asserts the new array-shaped body and
    // echoes the approved set back in the envelope.
    await page.route('**/votacao/sessions/*/votes', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      const body = route.request().postDataJSON() as { movie_ids: number[] }
      expect(Array.isArray(body.movie_ids)).toBe(true)
      expect(body.movie_ids).toEqual(expect.arrayContaining([1, 2]))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({ voted_movie_ids: body.movie_ids }, [
          { type: 'success', message: 'Voto registrado.' },
        ]),
      })
    })

    await page.goto('/votacao/1')
    await page.getByText('A Coisa').click()
    await page.getByText('Forrest Gump').click()
    await page.getByRole('button', { name: /votar \(2\)/i }).click()
    await expect(page.getByText(/voto registrado/i)).toBeVisible({
      timeout: 5_000,
    })
  })

  test('pre-selects the user approved movies and highlights them', async ({
    page,
  }) => {
    await mockAPI(page, { votedMovieIds: [1] })
    await page.goto('/votacao/1')
    // The previously approved card carries the "Seu voto" badge (exact text —
    // the helper sentence "Você pode mudar seu voto" must not match)…
    await expect(page.getByText('Seu voto', { exact: true })).toBeVisible()
    // …and the vote button reflects the pre-selected count (editable).
    await expect(
      page.getByRole('button', { name: /votar \(1\)/i }),
    ).toBeVisible()
  })

  test('shows results with a winner badge when closed', async ({ page }) => {
    await mockAPI(page, { sessionStatus: 'closed' })
    await page.goto('/votacao/1')
    await expect(page.getByText(/resultados/i)).toBeVisible()
    await expect(page.getByText(/total de votos/i)).toBeVisible()
    // results mock: movie 1 has 2 votes vs movie 2 with 1 → clear winner.
    await expect(page.getByText(/🏆 vencedor/i)).toBeVisible()
  })

  test('tiebreak roulette: admin draws a winner', async ({ page }) => {
    // Force the crypto-only entropy path (no camera in CI).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: () => Promise.reject(new Error('no camera')) },
        configurable: true,
      })
    })
    await mockAPI(page, { sessionStatus: 'closed' })
    // Override results to a tie so the TiebreakRoulette mounts.
    await page.route(`**/votacao/sessions/1/results`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({
          results: [
            { movie_id: 1, count: 1 },
            { movie_id: 2, count: 1 },
          ],
          total_votes: 2,
          total_voters: 2,
        }),
      }),
    )
    await page.route('**/votacao/sessions/*/tiebreak', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({
          winner_movie_id: 1,
          tied_movie_ids: [1, 2],
          server_nonce: 'abcd',
        }),
      })
    })

    await page.goto('/votacao/1')
    await page.getByTestId('capture-entropy').click()
    // Allow up to ~10s for the wheel animation to settle.
    await expect(page.getByText(/vencedor do desempate/i)).toBeVisible({
      timeout: 10_000,
    })
  })
})
