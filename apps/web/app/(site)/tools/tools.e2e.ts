import { test, expect } from '@playwright/test'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

test.describe('/tools landing', () => {
  test('exibe os 8 cards agrupados', async ({ page }) => {
    await page.goto('/tools')
    for (const slug of [
      'qr-reader',
      'qr-generator',
      'cpf',
      'cnpj',
      'json',
      'base64',
      'jwt',
      'uuid',
    ]) {
      await expect(page.locator(`a[href="/tools/${slug}"]`)).toBeVisible()
    }
  })

  test('navega para cada tool pelo card', async ({ page }) => {
    await page.goto('/tools')
    const slugs = ['uuid', 'cpf', 'json', 'base64', 'jwt']
    for (const slug of slugs) {
      await page.goto('/tools')
      await page.click(`a[href="/tools/${slug}"]`)
      await expect(page).toHaveURL(`/tools/${slug}`)
      await page.locator('a[href="/tools"]').first().click()
    }
  })
})

test.describe('UUID tool', () => {
  test('gera UUID com formato v4 válido', async ({ page }) => {
    await page.goto('/tools/uuid')
    await page.click('[data-testid="uuid-generate"]')
    const result = page.locator('[data-testid="uuid-result"]')
    await expect(result).toBeVisible()
    const text = await result.textContent()
    expect(text?.trim()).toMatch(UUID_V4_REGEX)
  })

  test('gera valores únicos em cliques consecutivos', async ({ page }) => {
    await page.goto('/tools/uuid')
    await page.click('[data-testid="uuid-generate"]')
    const first = await page
      .locator('[data-testid="uuid-result"]')
      .textContent()
    await page.click('[data-testid="uuid-generate"]')
    const items = page.locator('li')
    const second = await items.nth(0).locator('span').first().textContent()
    expect(first).not.toBe(second)
  })
})

test.describe('CPF tool', () => {
  test('gera CPF no formato 000.000.000-00', async ({ page }) => {
    await page.goto('/tools/cpf')
    await page.click('[data-testid="cpf-generate"]')
    const result = page.locator('[data-testid="cpf-result"]')
    await expect(result).toBeVisible()
    expect(await result.textContent()).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
  })

  test('valida CPF gerado como válido', async ({ page }) => {
    await page.goto('/tools/cpf')
    await page.click('[data-testid="cpf-generate"]')
    const generated = await page
      .locator('[data-testid="cpf-result"]')
      .textContent()
    await page.fill('[data-testid="cpf-validate-input"]', generated!)
    await page.click('[data-testid="cpf-validate-btn"]')
    await expect(page.locator('[data-testid="cpf-valid"]')).toBeVisible()
  })

  test('rejeita CPF inválido', async ({ page }) => {
    await page.goto('/tools/cpf')
    await page.fill('[data-testid="cpf-validate-input"]', '000.000.000-00')
    await page.click('[data-testid="cpf-validate-btn"]')
    await expect(page.locator('[data-testid="cpf-invalid"]')).toBeVisible()
  })
})

test.describe('JSON tool', () => {
  test('formata JSON válido', async ({ page }) => {
    await page.goto('/tools/json')
    await page.fill('[data-testid="json-input"]', '{"a":1,"b":2}')
    await page.click('[data-testid="json-format"]')
    const output = await page
      .locator('[data-testid="json-output"]')
      .inputValue()
    expect(output).toContain('"a"')
    expect(output).toContain('"b"')
  })

  test('exibe erro para JSON inválido', async ({ page }) => {
    await page.goto('/tools/json')
    await page.fill('[data-testid="json-input"]', '{invalid}')
    await page.click('[data-testid="json-format"]')
    await expect(page.locator('[data-testid="json-error"]')).toBeVisible()
  })
})

test.describe('Base64 tool', () => {
  test('encode e decode round-trip', async ({ page }) => {
    await page.goto('/tools/base64')
    const original = 'olá mundo 🎉'
    await page.fill('[data-testid="b64-text"]', original)
    await page.click('[data-testid="b64-encode"]')
    const encoded = await page
      .locator('[data-testid="b64-encoded"]')
      .inputValue()
    expect(encoded.length).toBeGreaterThan(0)
    await page.fill('[data-testid="b64-text"]', '')
    await page.click('[data-testid="b64-decode"]')
    const decoded = await page.locator('[data-testid="b64-text"]').inputValue()
    expect(decoded).toBe(original)
  })
})

test.describe('JWT tool', () => {
  const SAMPLE_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

  test('decodifica token e exibe claims', async ({ page }) => {
    await page.goto('/tools/jwt')
    await page.fill('[data-testid="jwt-input"]', SAMPLE_JWT)
    await page.click('[data-testid="jwt-decode"]')
    const result = page.locator('[data-testid="jwt-result"]')
    await expect(result).toBeVisible()
    await expect(result).toContainText('John Doe')
    await expect(result).toContainText('HS256')
  })

  test('exibe erro para token inválido', async ({ page }) => {
    await page.goto('/tools/jwt')
    await page.fill('[data-testid="jwt-input"]', 'nao.e.umjwt.valido.extra')
    await page.click('[data-testid="jwt-decode"]')
    await expect(page.locator('[data-testid="jwt-error"]')).toBeVisible()
  })
})

test.describe('QR Reader — permissão negada', () => {
  test('exibe fallback quando câmera é bloqueada', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: [],
    })
    const page = await context.newPage()
    await page.goto('/tools/qr-reader')
    await page.click('[data-testid="qr-start"]')
    await expect(
      page.locator('[data-testid="qr-permission-denied"]'),
    ).toBeVisible({ timeout: 10_000 })
    await context.close()
  })
})
