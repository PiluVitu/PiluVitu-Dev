import { test, expect, type Page } from '@playwright/test'

function envelope(data: unknown) {
  return JSON.stringify({ ok: true, data, notifications: [] })
}

const adminUser = {
  id: 1,
  email: 'a@x.com',
  name: 'Paulo Victor',
  picture: '',
  is_admin: true,
}

function audio(name: string) {
  return { name, mimeType: 'audio/ogg', buffer: Buffer.from(name) }
}

async function mockShell(page: Page) {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await page.route('**/api/admin/stats', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{}' }),
  )
}

const ID = '0123456789abcdef0123456789abcdef'

function job(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    status: 'na_fila',
    posicao: 1,
    parte_atual: 0,
    total_partes: 2,
    nome_atual: null,
    modelo: 'mlx-community/whisper-large-v3-turbo',
    criado_em: '2026-10-31T12:00:00Z',
    atualizado_em: '2026-10-31T12:00:00Z',
    resultado: null,
    erro: null,
    ...over,
  }
}

const pronto = job({
  status: 'pronto',
  posicao: null,
  parte_atual: 2,
  resultado: {
    partes: [],
    texto: '===== ÁUDIO 1 de 2 =====\n\nOlá ramielle',
    modelo: 'mlx-community/whisper-large-v3-turbo',
  },
})

/** Cada GET devolve o próximo estado da lista; o último se repete. */
async function mockStatus(page: Page, estados: unknown[]) {
  let i = 0
  await page.route(`**/admin/transcrever/${ID}`, (route) => {
    const data = estados[Math.min(i, estados.length - 1)]
    i += 1
    return route.fulfill({
      contentType: 'application/json',
      body: envelope(data),
    })
  })
}

// Polling a cada ~2,5 s: as asserções de estado esperam mais que o padrão.
const POLL = { timeout: 15_000 }

test('enfileira os áudios na ordem escolhida, mostra o progresso e o texto', async ({
  page,
}) => {
  await mockShell(page)
  let corpo = ''
  await page.route('**/admin/transcrever', async (route) => {
    corpo = route.request().postDataBuffer()?.toString('latin1') ?? ''
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: envelope(job()),
    })
  })
  await mockStatus(page, [
    job(),
    job({
      status: 'transcrevendo',
      posicao: null,
      parte_atual: 1,
      nome_atual: 'primeiro.ogg',
    }),
    pronto,
  ])

  await page.goto('/admin/transcricao')
  await page
    .getByTestId('transcricao-input')
    .setInputFiles([audio('primeiro.ogg'), audio('segundo.ogg')])

  // Reordena: o segundo sobe para o topo.
  await page.getByRole('button', { name: 'Subir segundo.ogg' }).click()
  await page.getByLabel('Termos que aparecem').fill('ramielle')
  await page.getByText('Rápido', { exact: true }).click()
  await page.getByRole('button', { name: 'Transcrever' }).click()

  await expect(page.getByText(/Na fila — posição 1/)).toBeVisible()
  await expect(
    page.getByText('Transcrevendo parte 2 de 2 — primeiro.ogg'),
  ).toBeVisible(POLL)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '50',
  )
  await expect(page.getByLabel('Transcrição', { exact: true })).toHaveValue(
    /Olá ramielle/,
    POLL,
  )

  // A ordem do multipart é a ordem da tela — é ela que encadeia o contexto.
  expect(corpo.indexOf('segundo.ogg')).toBeLessThan(
    corpo.indexOf('primeiro.ogg'),
  )
  expect(corpo).toMatch(/name="termos"\r\n\r\nramielle/)
  expect(corpo).toMatch(/name="modo"\r\n\r\nrapido/)

  await page.getByRole('button', { name: 'Nova transcrição' }).click()
  await expect(page.getByRole('button', { name: 'Transcrever' })).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('piluvitu:transcricao:job')),
  ).toBeNull()
})

test('sair e voltar retoma o acompanhamento do job guardado', async ({
  page,
}) => {
  await mockShell(page)
  await page.route('**/admin/transcrever', (route) =>
    route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: envelope(job()),
    }),
  )
  await mockStatus(page, [job()])

  await page.goto('/admin/transcricao')
  await page
    .getByTestId('transcricao-input')
    .setInputFiles([audio('unico.ogg')])
  await page.getByRole('button', { name: 'Transcrever' }).click()
  await expect(page.getByText(/Na fila/)).toBeVisible()

  await page.unroute(`**/admin/transcrever/${ID}`)
  await mockStatus(page, [pronto])
  await page.goto('/admin')
  await page.goto('/admin/transcricao')

  await expect(page.getByLabel('Transcrição', { exact: true })).toHaveValue(
    /Olá ramielle/,
    POLL,
  )
})

test('job que falhou mostra a mensagem e deixa começar de novo', async ({
  page,
}) => {
  await mockShell(page)
  await page.addInitScript(
    (id) => localStorage.setItem('piluvitu:transcricao:job', id),
    ID,
  )
  await mockStatus(page, [
    job({
      status: 'falhou',
      posicao: null,
      erro: {
        code: 'promeia_reiniciado',
        message:
          'O promeia reiniciou no meio da transcrição. Envie os áudios de novo.',
      },
    }),
  ])

  await page.goto('/admin/transcricao')
  await expect(page.getByRole('alert').filter({ hasText: /./ })).toHaveText(
    /promeia reiniciou/,
  )
  await page.getByRole('button', { name: 'Nova transcrição' }).click()
  await expect(page.getByRole('button', { name: 'Transcrever' })).toBeVisible()
})

test('job que expirou (404 job_not_found) esquece o id e avisa', async ({
  page,
}) => {
  await mockShell(page)
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem('semeado')) {
      localStorage.setItem('piluvitu:transcricao:job', id)
      sessionStorage.setItem('semeado', '1')
    }
  }, ID)
  await page.route(`**/admin/transcrever/${ID}`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'job_not_found',
            message: 'Transcrição não encontrada — ela pode ter expirado.',
          },
        ],
      }),
    }),
  )

  await page.goto('/admin/transcricao')
  await expect(page.getByRole('alert').filter({ hasText: /./ })).toHaveText(
    /não encontrada/,
  )
  expect(
    await page.evaluate(() => localStorage.getItem('piluvitu:transcricao:job')),
  ).toBeNull()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Transcrever' })).toBeVisible()
})

// O job some no meio do polling: a tela não pode seguir mostrando o progresso
// (e o "pode sair desta tela") de um job que não existe mais.
test('job que some durante a transcrição tira o progresso da tela', async ({
  page,
}) => {
  await mockShell(page)
  await page.addInitScript(
    (id) => localStorage.setItem('piluvitu:transcricao:job', id),
    ID,
  )
  let chamadas = 0
  await page.route(`**/admin/transcrever/${ID}`, (route) => {
    chamadas += 1
    if (chamadas === 1) {
      return route.fulfill({
        contentType: 'application/json',
        body: envelope(job({ status: 'transcrevendo', posicao: null })),
      })
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'job_not_found',
            message: 'Transcrição não encontrada — ela pode ter expirado.',
          },
        ],
      }),
    })
  })

  await page.goto('/admin/transcricao')
  await expect(page.getByRole('progressbar')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: /./ })).toHaveText(
    /não encontrada/,
    POLL,
  )
  await expect(page.getByRole('progressbar')).toBeHidden()
  await expect(page.getByText(/Pode sair desta tela/)).toBeHidden()
})

test('mostra a mensagem do servidor quando o Mac está desligado', async ({
  page,
}) => {
  await mockShell(page)
  await page.route('**/admin/transcrever', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'promeia_unreachable',
            message: 'Suba o promeia no Mac para usar este recurso.',
          },
        ],
      }),
    }),
  )

  await page.goto('/admin/transcricao')
  await page
    .getByTestId('transcricao-input')
    .setInputFiles([audio('unico.ogg')])
  await page.getByRole('button', { name: 'Transcrever' }).click()

  await expect(page.getByText('Suba o promeia no Mac')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Transcrever' })).toBeEnabled()
})

test('botão fica desabilitado sem áudio na fila', async ({ page }) => {
  await mockShell(page)
  await page.goto('/admin/transcricao')
  await expect(page.getByRole('button', { name: 'Transcrever' })).toBeDisabled()
})

// Deploy fora de ordem: o web novo no ar com ramielle/promeia ainda síncronos.
test('resposta antiga, sem id, mostra o texto e não guarda nada', async ({
  page,
}) => {
  await mockShell(page)
  await page.route('**/admin/transcrever', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope({
        partes: [{ nome: 'a.ogg', texto: 'Olá síncrono' }],
        texto: 'Olá síncrono',
        modelo: 'mlx-community/whisper-large-v3-mlx',
      }),
    }),
  )
  let gets = 0
  await page.route('**/admin/transcrever/*', (route) => {
    gets += 1
    return route.fulfill({ status: 404, body: '' })
  })

  await page.goto('/admin/transcricao')
  await page.getByTestId('transcricao-input').setInputFiles([audio('a.ogg')])
  await page.getByRole('button', { name: 'Transcrever' }).click()

  await expect(page.getByLabel('Transcrição', { exact: true })).toHaveValue(
    'Olá síncrono',
  )
  expect(
    await page.evaluate(() => localStorage.getItem('piluvitu:transcricao:job')),
  ).toBeNull()
  expect(gets).toBe(0)
})
