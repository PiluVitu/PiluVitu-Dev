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

test('transcreve os áudios na ordem escolhida e mostra o texto', async ({
  page,
}) => {
  await mockShell(page)
  let corpo = ''
  await page.route('**/admin/transcrever', async (route) => {
    corpo = route.request().postDataBuffer()?.toString('latin1') ?? ''
    await route.fulfill({
      contentType: 'application/json',
      body: envelope({
        partes: [],
        texto: '===== ÁUDIO 1 de 2 =====\n\nOlá ramielle',
        modelo: 'mlx-community/whisper-large-v3-turbo',
      }),
    })
  })

  await page.goto('/admin/transcricao')
  await page
    .getByTestId('transcricao-input')
    .setInputFiles([audio('primeiro.ogg'), audio('segundo.ogg')])

  // Reordena: o segundo sobe para o topo.
  await page.getByRole('button', { name: 'Subir segundo.ogg' }).click()
  await page.getByLabel('Termos que aparecem').fill('ramielle')
  await page.getByText('Rápido', { exact: true }).click()
  await page.getByRole('button', { name: 'Transcrever' }).click()

  await expect(page.getByLabel('Transcrição')).toHaveValue(/Olá ramielle/)

  // A ordem do multipart é a ordem da tela — é ela que encadeia o contexto.
  expect(corpo.indexOf('segundo.ogg')).toBeLessThan(
    corpo.indexOf('primeiro.ogg'),
  )
  expect(corpo).toMatch(/name="termos"\r\n\r\nramielle/)
  expect(corpo).toMatch(/name="modo"\r\n\r\nrapido/)
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
