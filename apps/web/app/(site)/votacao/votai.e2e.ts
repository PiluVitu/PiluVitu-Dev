import { test, expect, type Page } from '@playwright/test'

// O host do Votaí e o 308 do site (proxy.ts + lib/votai.ts). No next dev, o ambiente é o de dev:
// Votaí em votai.localhost:3333 e site em localhost:3333, as duas origens fixas em código.
const VOTAI = 'http://votai.localhost:3333'
const SITE = 'http://localhost:3333'

function envelope(data: unknown) {
  return JSON.stringify({ ok: true, data, notifications: [] })
}

const sessao = {
  ID: 12,
  Title: 'Sexta 22/05',
  Status: 'open' as const,
  CreatedBy: 1,
  CreatedAt: new Date().toISOString(),
  ClosedAt: null,
  WinnerMovieID: null,
  WinnerMethod: null,
  SortOptionsJSON: '{}',
}

async function mocks(page: Page, logado = false) {
  await page.route('**/auth/me', (r) =>
    logado
      ? r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: envelope({
            id: 1,
            email: 'a@example.com',
            name: 'Admin',
            picture: '',
            is_admin: true,
          }),
        })
      : r.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            data: null,
            notifications: [
              { type: 'error', code: 'not_authenticated', message: 'Entre.' },
            ],
          }),
        }),
  )
  await page.route('**/votacao/sessions', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({ sessions: [sessao] }),
    }),
  )
  await page.route('**/votacao/sessions/12', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        session: sessao,
        movies: [
          {
            ID: 1,
            SessionID: 12,
            Category: 'terror',
            Title: 'A Coisa',
            Type: 'filme',
            PosterURL: '',
            WasWatched: false,
          },
        ],
        has_voted: false,
        voted_movie_ids: [],
      }),
    }),
  )
}

test.describe('host do Votaí', () => {
  test('a raiz mostra a lista, sem trocar de endereço', async ({ page }) => {
    await mocks(page)
    const resposta = await page.goto(`${VOTAI}/`)
    expect(resposta?.status()).toBe(200)
    await expect(page).toHaveURL(`${VOTAI}/`)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Votaí' }),
    ).toBeVisible()
    await expect(page).toHaveTitle('Votaí')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, follow',
    )
    await expect(
      page.getByRole('button', { name: /entrar com google/i }),
    ).toBeVisible()
  })

  test('/12 mostra a sessão 12', async ({ page }) => {
    await mocks(page)
    await page.goto(`${VOTAI}/12`)
    await expect(page).toHaveURL(`${VOTAI}/12`)
    await expect(page.getByText('A Coisa')).toBeVisible()
    await expect(
      page.getByText('Você precisa estar logado pra votar.'),
    ).toBeVisible()
  })

  // A base dos links é medida aqui: o HTML estático sai com /votacao (o servidor não lê o host) e
  // a hidratação troca pela raiz. Se a troca falhasse, os links levariam a /votacao/12, que o proxy
  // redireciona de volta, e a navegação no cliente quebraria.
  test('os links da lista e da sessão apontam para a raiz do Votaí', async ({
    page,
  }) => {
    await mocks(page, true)
    await page.goto(`${VOTAI}/`)
    await expect(
      page.getByRole('link', { name: /Sexta 22\/05/ }),
    ).toHaveAttribute('href', '/12')
    await expect(
      page.getByRole('link', { name: 'Votações anteriores' }),
    ).toHaveAttribute('href', '/anteriores')
    await expect(
      page.getByRole('link', { name: 'Paulo Victor' }),
    ).toHaveAttribute('href', `${SITE}/`)
    await page.getByRole('link', { name: /Sexta 22\/05/ }).click()
    await expect(page).toHaveURL(`${VOTAI}/12`)
    await expect(page.getByRole('link', { name: 'Votaí' })).toHaveAttribute(
      'href',
      '/',
    )
    await page.getByRole('link', { name: 'Votaí' }).click()
    await expect(page).toHaveURL(`${VOTAI}/`)
  })

  test('a hidratação da lista e da sessão não acusa erro', async ({ page }) => {
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error' && /hydrat/i.test(m.text())) erros.push(m.text())
    })
    await mocks(page, true)
    await page.goto(`${VOTAI}/`)
    await expect(page.getByRole('link', { name: /Sexta 22\/05/ })).toBeVisible()
    await page.goto(`${VOTAI}/12`)
    await expect(page.getByText('A Coisa')).toBeVisible()
    expect(erros).toEqual([])
  })

  // Em produção, o resto do site no Votaí é 308 para piluvitu.com.br (lib/votai.test.ts e
  // proxy.test.ts). No next dev, o Next devolve relativo um Location para o loopback, o 308 viraria
  // loop no próprio Votaí, então o dev responde 404: o que se mede aqui é que o site não aparece.
  test('fora da votação, o host do Votaí não mostra o site', async ({
    page,
    request,
  }) => {
    for (const caminho of [
      '/posts',
      '/tools?x=1',
      '/admin/sessoes',
      '/privacidade',
    ]) {
      const res = await request.get(`${VOTAI}${caminho}`, { maxRedirects: 0 })
      expect(res.status()).toBe(404)
      expect(res.headers()['location']).toBeUndefined()
    }
    await page.goto(`${VOTAI}/privacidade`)
    await expect(page).toHaveURL(`${VOTAI}/privacidade`)
    await expect(
      page.getByRole('heading', { name: 'Política de privacidade' }),
    ).toHaveCount(0)
  })

  test('o caminho antigo dentro do Votaí vira o novo', async ({ request }) => {
    const res = await request.get(`${VOTAI}/votacao/12`, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(res.headers()['location']).toBe(`${VOTAI}/12`)
  })
})

test.describe('308 do site para o Votaí', () => {
  for (const [antigo, novo] of [
    ['/votacao', '/'],
    ['/votacao/12', '/12'],
    ['/votacao/anteriores', '/anteriores'],
    ['/votacao/anteriores/7', '/anteriores/7'],
  ])
    test(`${antigo} → Votaí ${novo}`, async ({ request }) => {
      const res = await request.get(`${SITE}${antigo}`, { maxRedirects: 0 })
      expect(res.status()).toBe(308)
      expect(res.headers()['location']).toBe(`${VOTAI}${novo}`)
    })

  test('o navegador segue o 308 e cai na sessão no Votaí', async ({ page }) => {
    await mocks(page)
    await page.goto(`${SITE}/votacao/12`)
    await expect(page).toHaveURL(`${VOTAI}/12`)
    await expect(page.getByText('A Coisa')).toBeVisible()
  })

  test('/votacao/admin continua indo para o painel no site', async ({
    request,
  }) => {
    const res = await request.get(`${SITE}/votacao/admin`, { maxRedirects: 0 })
    expect(res.headers()['location'] ?? '').not.toContain('votai.')
  })
})
