import { test, expect, type Page } from '@playwright/test'

const VOTAI = 'http://votai.localhost:3333'

function envelope(data: unknown) {
  return JSON.stringify({ ok: true, data, notifications: [] })
}

const filme = (id: number, title: string, votes: number) => ({
  id,
  title,
  type: 'filme',
  category: 'terror',
  poster_url: '',
  votes,
})

const porVotos = {
  id: 12,
  title: 'Sexta 22/05',
  created_at: '2026-05-22T21:00:00Z',
  closed_at: '2026-05-23T00:30:00Z',
  theme: null,
  mode: 'votacao',
  winner_movie_id: 1,
  winner_method: 'votes',
  total_voters: 4,
  total_votes: 7,
  movies: [filme(1, 'A Coisa', 4), filme(2, 'Forrest Gump', 3)],
}

const roleta = {
  ...porVotos,
  id: 13,
  title: 'Noite de Halloween',
  theme: 'halloween',
  mode: 'roleta',
  winner_movie_id: 3,
  winner_method: 'roulette',
  total_voters: 0,
  total_votes: 0,
  movies: [filme(3, 'Hereditário', 0), filme(4, 'O Exorcista', 0)],
}

// Anônimo de verdade: /auth/me responde 401 e qualquer pedido que levasse cookie é registrado.
async function anonimo(page: Page) {
  const comCookie: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/votacao/historico') && r.headers()['cookie'])
      comCookie.push(r.url())
  })
  await page.route('**/auth/me', (r) =>
    r.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, data: null, notifications: [] }),
    }),
  )
  await page.route('**/votacao/historico?page=1', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        sessions: [porVotos, roleta],
        page: 1,
        page_size: 10,
        total: 11,
        has_more: true,
      }),
    }),
  )
  await page.route('**/votacao/historico?page=2', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        sessions: [{ ...porVotos, id: 1, title: 'A primeira noite' }],
        page: 2,
        page_size: 10,
        total: 11,
        has_more: false,
      }),
    }),
  )
  await page.route('**/votacao/historico/12', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope(porVotos),
    }),
  )
  await page.route('**/votacao/historico/13', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope(roleta),
    }),
  )
  await page.route('**/votacao/historico/99', (r) =>
    r.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        data: null,
        notifications: [{ type: 'error', code: 'not_found', message: 'x' }],
      }),
    }),
  )
  return comCookie
}

test.describe('Votações anteriores (sem login)', () => {
  test('a lista mostra as noites encerradas, o vencedor e o sorteado na roleta', async ({
    page,
  }) => {
    const comCookie = await anonimo(page)
    await page.goto(`${VOTAI}/anteriores`)
    await expect(page).toHaveURL(`${VOTAI}/anteriores`)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Votações anteriores' }),
    ).toBeVisible()
    await expect(page.getByText('🏆 Vencedor:')).toBeVisible()
    await expect(page.getByText('4 participantes')).toBeVisible()
    await expect(page.getByText('🎃 Sorteado na roleta:')).toBeVisible()
    await expect(page.getByText('Hereditário')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow',
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://votai.piluvitu.com.br/anteriores',
    )
    expect(comCookie).toEqual([])
  })

  test('pagina para as mais antigas e volta', async ({ page }) => {
    await anonimo(page)
    await page.goto(`${VOTAI}/anteriores`)
    await page.getByRole('button', { name: 'Mais antigas' }).click()
    await expect(page.getByText('A primeira noite')).toBeVisible()
    await expect(page.getByText('página 2 de 2')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Mais antigas' }),
    ).toBeDisabled()
    await page.getByRole('button', { name: 'Mais recentes' }).click()
    await expect(page.getByText('Sexta 22/05')).toBeVisible()
  })

  test('o detalhe mostra a contagem por filme, sem nome de quem votou', async ({
    page,
  }) => {
    await anonimo(page)
    await page.goto(`${VOTAI}/anteriores`)
    await page.getByRole('link', { name: /Sexta 22\/05/ }).click()
    await expect(page).toHaveURL(`${VOTAI}/anteriores/12`)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sexta 22/05' }),
    ).toBeVisible()
    await expect(page.getByText('Total de votos: 7')).toBeVisible()
    const linhas = page.getByRole('listitem')
    await expect(linhas).toHaveCount(2)
    await expect(linhas.nth(0)).toContainText('A Coisa')
    await expect(linhas.nth(0)).toContainText('🏆 Vencedor')
    await expect(linhas.nth(0)).toContainText('4 (57%)')
    await expect(linhas.nth(1)).toContainText('3 (43%)')
    const texto = await page.locator('main, body').first().innerText()
    expect(texto).not.toMatch(/@|seu voto|Admin|votou em/i)
    await expect(
      page.getByRole('button', { name: /entrar com google/i }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Votações anteriores' }),
    ).toHaveAttribute('href', '/anteriores')
  })

  test('a roleta de Halloween ganha o tema e mostra o sorteado', async ({
    page,
  }) => {
    await anonimo(page)
    await page.goto(`${VOTAI}/anteriores/13`)
    await expect(page.locator('[data-theme-votacao="halloween"]')).toBeVisible()
    await expect(page.getByTestId('historico-vencedor')).toContainText(
      'Hereditário',
    )
    await expect(page.getByText('2 filmes na roleta')).toBeVisible()
  })

  test('sessão aberta ou inexistente dá a mensagem do 404', async ({
    page,
  }) => {
    await anonimo(page)
    await page.goto(`${VOTAI}/anteriores/99`)
    await expect(
      page.getByText('Essa votação não existe ou ainda está aberta.'),
    ).toBeVisible()
    await expect(
      page.locator('meta[name="robots"][content="noindex"]'),
    ).toHaveCount(1)
  })

  test('a lista do Votaí leva ao histórico, mesmo sem login', async ({
    page,
  }) => {
    await anonimo(page)
    // Contrato real do ramielle: sem cookie, a lista de sessões é 401.
    await page.route('**/votacao/sessions', (r) =>
      r.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          data: null,
          notifications: [
            { type: 'error', code: 'not_authenticated', message: 'x' },
          ],
        }),
      }),
    )
    await page.goto(`${VOTAI}/`)
    await expect(
      page.getByText(
        'Entre com o Google para ver e votar nas sessões abertas.',
      ),
    ).toBeVisible()
    await expect(page.getByText('Erro ao carregar sessões.')).toHaveCount(0)
    await page.getByRole('link', { name: 'Votações anteriores' }).click()
    await expect(page).toHaveURL(`${VOTAI}/anteriores`)
    await expect(page.getByText('Hereditário')).toBeVisible()
  })
})
