import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { test, expect, type CDPSession, type Page } from '@playwright/test'

// Cerimônia WebAuthn de verdade no Chromium, com um autenticador virtual via
// CDP (sem aparelho físico). O ramielle é mockado por page.route: aqui se
// confere o que o navegador manda, não a verificação da assinatura (essa é
// do ramielle, testada lá).

const b64url = (buf: Buffer) => buf.toString('base64url')

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

const naoAutenticado = {
  status: 401,
  contentType: 'application/json',
  body: JSON.stringify({
    ok: false,
    data: null,
    notifications: [
      { type: 'error', code: 'not_authenticated', message: 'Logue.' },
    ],
  }),
}

async function autenticadorVirtual(page: Page): Promise<{
  cdp: CDPSession
  authenticatorId: string
}> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  )
  return { cdp, authenticatorId }
}

async function mockAdminBase(page: Page) {
  await page.route('**/votacao/sessions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope({ sessions: [] }),
    }),
  )
  await page.route('**/api/admin/stats', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        posts: 0,
        drafts: 0,
        published: 0,
        pilulabs: 0,
        careers: 0,
        careersCurrent: 0,
        recentPosts: [],
      }),
    }),
  )
  await page.route('**/api/admin/github/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ linked: true, login: 'piluvitu' }),
    }),
  )
}

test('login: "Entrar com passkey" assina com a credencial do aparelho e abre o painel', async ({
  page,
}) => {
  const { cdp, authenticatorId } = await autenticadorVirtual(page)
  const credentialId = randomBytes(16)
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: {
      credentialId: credentialId.toString('base64'),
      isResidentCredential: true,
      rpId: 'localhost',
      privateKey: privateKey
        .export({ format: 'der', type: 'pkcs8' })
        .toString('base64'),
      userHandle: Buffer.from('user-1').toString('base64'),
      signCount: 0,
    },
  })

  let logado = false
  await page.route('**/auth/me', (route) =>
    logado
      ? route.fulfill({
          contentType: 'application/json',
          body: envelope(adminUser),
        })
      : route.fulfill(naoAutenticado),
  )
  await mockAdminBase(page)

  const challenge = b64url(randomBytes(32))
  await page.route('**/api/auth/passkey/generate-authenticate-options', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        challenge,
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: 'required',
        timeout: 60_000,
      }),
    }),
  )
  let corpoVerificacao: Record<string, unknown> | null = null
  await page.route('**/api/auth/passkey/verify-authentication', (r) => {
    corpoVerificacao = r.request().postDataJSON()
    logado = true
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ session: { id: 's' }, user: { id: 'user-1' } }),
    })
  })

  await page.goto('/admin')
  await page.getByRole('button', { name: /entrar com passkey/i }).click()

  await expect(
    page.getByRole('heading', { name: /Bem-vindo de volta, Paulo/ }),
  ).toBeVisible()

  const enviado = corpoVerificacao as unknown as {
    response: {
      id: string
      type: string
      response: { clientDataJSON: string; userHandle?: string }
      clientExtensionResults?: unknown
    }
  }
  expect(enviado.response.id).toBe(b64url(credentialId))
  expect(enviado.response.type).toBe('public-key')
  expect(enviado.response).not.toHaveProperty('clientExtensionResults')
  const clientData = JSON.parse(
    Buffer.from(
      enviado.response.response.clientDataJSON,
      'base64url',
    ).toString(),
  )
  expect(clientData).toMatchObject({
    type: 'webauthn.get',
    challenge,
    origin: 'http://localhost:3333',
  })
})

test('login: passkey desconhecida no servidor mostra o erro e continua na tela de login', async ({
  page,
}) => {
  const { cdp, authenticatorId } = await autenticadorVirtual(page)
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: {
      credentialId: randomBytes(16).toString('base64'),
      isResidentCredential: true,
      rpId: 'localhost',
      privateKey: privateKey
        .export({ format: 'der', type: 'pkcs8' })
        .toString('base64'),
      userHandle: Buffer.from('user-1').toString('base64'),
      signCount: 0,
    },
  })
  await page.route('**/auth/me', (route) => route.fulfill(naoAutenticado))
  await mockAdminBase(page)
  await page.route('**/api/auth/passkey/generate-authenticate-options', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        challenge: b64url(randomBytes(32)),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: 'required',
      }),
    }),
  )
  await page.route('**/api/auth/passkey/verify-authentication', (r) =>
    r.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'PASSKEY_NOT_FOUND',
        message: 'Passkey not found',
      }),
    }),
  )

  await page.goto('/admin')
  await page.getByRole('button', { name: /entrar com passkey/i }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /não reconhecida/i }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /entrar com google/i }),
  ).toBeEnabled()
})

test('painel: cadastra a passkey do aparelho, lista e remove', async ({
  page,
}) => {
  await autenticadorVirtual(page)
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await mockAdminBase(page)

  type Item = { id: string; name: string | null; createdAt: string }
  let passkeys: Item[] = []
  await page.route('**/api/auth/passkey/list-user-passkeys', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(passkeys),
    }),
  )

  const challenge = b64url(randomBytes(32))
  let urlOpcoes = ''
  await page.route('**/api/auth/passkey/generate-register-options*', (r) => {
    urlOpcoes = r.request().url()
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        challenge,
        rp: { name: 'piluvitu', id: 'localhost' },
        user: {
          id: b64url(Buffer.from('user-1')),
          name: 'a@x.com',
          displayName: 'Paulo Victor',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        timeout: 60_000,
        attestation: 'none',
        excludeCredentials: [],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      }),
    })
  })
  let corpoRegistro: {
    name?: string
    response: { id: string; response: { clientDataJSON: string } }
  } | null = null
  await page.route('**/api/auth/passkey/verify-registration', (r) => {
    corpoRegistro = r.request().postDataJSON()
    const novo = {
      id: 'pk-1',
      name: corpoRegistro!.name ?? null,
      createdAt: '2026-10-20T15:00:00.000Z',
    }
    passkeys = [novo]
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(novo),
    })
  })
  let corpoRemocao: { id: string } | null = null
  await page.route('**/api/auth/passkey/delete-passkey', (r) => {
    corpoRemocao = r.request().postDataJSON()
    passkeys = []
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: true }),
    })
  })

  await page.goto('/admin/passkeys')
  await expect(page.getByText(/nenhuma passkey cadastrada/i)).toBeVisible()

  await page.getByRole('textbox').fill('MacBook')
  await page.getByRole('button', { name: /cadastrar passkey/i }).click()

  await expect(page.getByText('MacBook', { exact: true })).toBeVisible()
  expect(new URL(urlOpcoes).searchParams.get('name')).toBe('MacBook')
  const registro = corpoRegistro as unknown as {
    name?: string
    response: { response: { clientDataJSON: string } }
  }
  expect(registro.name).toBe('MacBook')
  const clientData = JSON.parse(
    Buffer.from(
      registro.response.response.clientDataJSON,
      'base64url',
    ).toString(),
  )
  expect(clientData).toMatchObject({
    type: 'webauthn.create',
    challenge,
    origin: 'http://localhost:3333',
  })

  await page.getByRole('button', { name: 'Remover a passkey MacBook' }).click()
  await expect(page.getByText(/nenhuma passkey cadastrada/i)).toBeVisible()
  expect(corpoRemocao).toEqual({ id: 'pk-1' })
})

test('painel: não-admin barrado pelo ramielle (403) vê o erro, sem falha silenciosa', async ({
  page,
}) => {
  await autenticadorVirtual(page)
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await mockAdminBase(page)
  await page.route('**/api/auth/passkey/list-user-passkeys', (r) =>
    r.fulfill({ contentType: 'application/json', body: '[]' }),
  )
  await page.route('**/api/auth/passkey/generate-register-options*', (r) =>
    r.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'admin_only',
            message: 'Acesso restrito a administradores.',
          },
        ],
      }),
    }),
  )

  await page.goto('/admin/passkeys')
  await page.getByRole('button', { name: /cadastrar passkey/i }).click()
  await expect(
    page.getByText('Só administradores podem cadastrar passkeys.'),
  ).toBeVisible()
})
