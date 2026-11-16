import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { contarPaginas } from '@piluvitu/tools/pdf'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

test.describe('/tools landing', () => {
  test('exibe os 10 cards agrupados', async ({ page }) => {
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
      'roleta',
      'mesclar-pdf',
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

test.describe('CNPJ tool', () => {
  test('gera CNPJ no formato 00.000.000/0000-00', async ({ page }) => {
    await page.goto('/tools/cnpj')
    await page.click('[data-testid="cnpj-generate"]')
    const result = page.locator('[data-testid="cnpj-result"]')
    await expect(result).toBeVisible()
    expect(await result.textContent()).toMatch(
      /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
    )
  })

  test('valida CNPJ gerado como válido', async ({ page }) => {
    await page.goto('/tools/cnpj')
    await page.click('[data-testid="cnpj-generate"]')
    const generated = await page
      .locator('[data-testid="cnpj-result"]')
      .textContent()
    await page.fill('[data-testid="cnpj-validate-input"]', generated!)
    await page.click('[data-testid="cnpj-validate-btn"]')
    await expect(page.locator('[data-testid="cnpj-valid"]')).toBeVisible()
  })

  test('rejeita CNPJ inválido', async ({ page }) => {
    await page.goto('/tools/cnpj')
    await page.fill('[data-testid="cnpj-validate-input"]', '00.000.000/0000-00')
    await page.click('[data-testid="cnpj-validate-btn"]')
    await expect(page.locator('[data-testid="cnpj-invalid"]')).toBeVisible()
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
    // Simula bloqueio de câmera de forma determinística (independe do host /
    // headless): sobrescreve getUserMedia pra rejeitar com NotAllowedError. Sem
    // isso, o headless lança NotSupportedError e o fallback não dispara.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          configurable: true,
          value: () =>
            Promise.reject(
              new DOMException('Permission denied', 'NotAllowedError'),
            ),
        })
      } catch {
        /* mediaDevices ausente — o fallback do componente cobre */
      }
    })
    await page.goto('/tools/qr-reader')
    await page.click('[data-testid="qr-start"]')
    await expect(
      page.locator('[data-testid="qr-permission-denied"]'),
    ).toBeVisible({ timeout: 10_000 })
    await context.close()
  })
})

test.describe('Roleta', () => {
  test('sorteia um vencedor usando aleatório do navegador', async ({
    page,
  }) => {
    await page.goto('/tools/roleta')
    await expect(page.getByTestId('roleta-options')).toBeVisible()

    // Crypto-only path needs no camera permission.
    await page.getByTestId('roleta-spin-crypto').click()

    await expect(page.getByTestId('roleta-winner')).toBeVisible({
      timeout: 10000,
    })
    const text = (await page.getByTestId('roleta-winner').textContent()) ?? ''
    expect(
      ['Pizza', 'Sushi', 'Hambúrguer', 'Tapioca'].some((o) => text.includes(o)),
    ).toBe(true)
  })
})

// Cada página com um lado diferente: o PDF baixado diz a ordem em que as páginas entraram.
async function pdfDeTeste(nome: string, lados: number[]) {
  const documento = await PDFDocument.create()
  for (const lado of lados) documento.addPage([lado, lado])
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await documento.save()),
  }
}

async function pdfProtegido(nome: string) {
  const documento = await PDFDocument.load(
    (await pdfDeTeste(nome, [100])).buffer,
  )
  documento.context.trailerInfo.Encrypt = documento.context.register(
    documento.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 }),
  )
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await documento.save({ useObjectStreams: false })),
  }
}

async function escolherPdfs(
  page: Page,
  arquivos: { name: string; mimeType: string; buffer: Buffer }[],
) {
  await page.getByTestId('pdf-input').setInputFiles(arquivos)
}

function medirContrasteDoTexto(seletor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const rgba = (cor: string) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = cor
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const sobre = (de: number[], fundo: number[]) =>
    [0, 1, 2].map((i) => de[i] * de[3] + fundo[i] * (1 - de[3]))
  const fundoDe = (el: Element) => {
    const camadas: number[][] = []
    for (let no: Element | null = el; no; no = no.parentElement) {
      const cor = rgba(getComputedStyle(no).backgroundColor)
      if (cor[3] > 0) camadas.push(cor)
      if (cor[3] >= 1) break
    }
    return camadas.reduceRight((f, c) => sobre(c, f), [255, 255, 255])
  }
  const luminancia = (rgb: number[]) => {
    const [r, g, b] = rgb.map((c) => {
      const v = c / 255
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const folhas = [...document.querySelectorAll(`${seletor} *`)].filter(
    (el) =>
      [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim(),
      ) && !el.closest('.sr-only'),
  )
  return folhas.map((el) => {
    const fundo = fundoDe(el)
    const texto = sobre(rgba(getComputedStyle(el).color), fundo)
    const [claro, escuro] = [luminancia(texto), luminancia(fundo)].sort(
      (a, b) => b - a,
    )
    return {
      texto: el.textContent!.trim().slice(0, 30),
      razao: Math.round(((claro + 0.05) / (escuro + 0.05)) * 100) / 100,
    }
  })
}

test.describe('Mesclar PDF', () => {
  test('mescla na ordem escolhida pelo teclado e baixa o PDF com as páginas certas', async ({
    page,
  }) => {
    await page.goto('/tools/mesclar-pdf')
    await expect(
      page.getByText('Seus arquivos não saem do aparelho'),
    ).toBeVisible()

    await escolherPdfs(page, [
      await pdfDeTeste('a.pdf', [100, 101]),
      await pdfDeTeste('b.pdf', [200, 201, 202]),
    ])
    await expect(page.getByTestId('mesclar-pdf-resumo')).toHaveText(
      /^2 arquivos · 5 páginas · /,
    )

    await page.getByRole('button', { name: 'Subir b.pdf' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('mesclar-pdf-nome-do-item')).toHaveText([
      'b.pdf',
      'a.pdf',
    ])
    await expect(
      page.getByRole('button', { name: 'Descer b.pdf' }),
    ).toBeFocused()

    await page.getByRole('button', { name: 'Mesclar PDFs' }).click()
    const baixar = page.getByRole('link', { name: 'Baixar mesclado.pdf' })
    await expect(baixar).toBeFocused({ timeout: 30_000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Enter'),
    ])
    expect(download.suggestedFilename()).toBe('mesclado.pdf')
    const bytes = new Uint8Array(readFileSync((await download.path())!))
    expect(await contarPaginas(bytes)).toBe(5)
    const final = await PDFDocument.load(bytes)
    expect(final.getPages().map((p) => p.getWidth())).toEqual([
      200, 201, 202, 100, 101,
    ])
  })

  test('nada sai do aparelho: o fluxo inteiro só faz GET na própria origem', async ({
    page,
  }) => {
    const pedidos: { metodo: string; url: string }[] = []
    page.on('request', (r) =>
      pedidos.push({ metodo: r.method(), url: r.url() }),
    )
    await page.goto('/tools/mesclar-pdf')
    const origem = new URL(page.url()).origin
    pedidos.length = 0

    await escolherPdfs(page, [
      await pdfDeTeste('a.pdf', [100]),
      await pdfDeTeste('b.pdf', [200]),
    ])
    await page.getByRole('button', { name: 'Mesclar PDFs' }).click()
    await expect(
      page.getByRole('link', { name: 'Baixar mesclado.pdf' }),
    ).toBeVisible({ timeout: 30_000 })

    const deFora = pedidos.filter(
      (p) =>
        p.metodo !== 'GET' ||
        !(p.url.startsWith(origem) || p.url.startsWith('blob:')),
    )
    expect(deFora).toEqual([])
  })

  test('o pdf-lib só chega com o Worker, depois que a pessoa escolhe um arquivo', async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await page.goto('/tools/mesclar-pdf')
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
    expect(workers).toEqual([])

    await escolherPdfs(page, [await pdfDeTeste('a.pdf', [100])])
    await expect(page.getByTestId('mesclar-pdf-item')).toContainText('1 página')
    expect(workers).toHaveLength(1)
  })

  test('PDF protegido e arquivo que não é PDF ficam com o erro escrito e travam o Mesclar', async ({
    page,
  }) => {
    await page.goto('/tools/mesclar-pdf')
    await escolherPdfs(page, [
      await pdfDeTeste('ok.pdf', [100]),
      await pdfProtegido('com-senha.pdf'),
      { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') },
    ])

    await expect(page.getByTestId('mesclar-pdf-erro-do-item')).toHaveText([
      /protegido por senha/,
      /Não é um PDF/,
    ])
    await expect(
      page.getByRole('button', { name: 'Mesclar PDFs' }),
    ).toBeDisabled()
    await expect(
      page.getByText('Remova os arquivos com erro para mesclar.'),
    ).toBeVisible()
  })

  test('a 320 px, nome comprido não faz a página rolar para o lado e os botões têm 44 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/mesclar-pdf')
    await escolherPdfs(page, [
      await pdfDeTeste(
        'relatorio-trimestral-consolidado-versao-final-revisada-2026.pdf',
        [100],
      ),
      await pdfDeTeste('b.pdf', [100]),
    ])
    await expect(page.getByTestId('mesclar-pdf-item').first()).toContainText(
      '1 página',
    )

    const largura = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(largura).toBeLessThanOrEqual(320)
    for (const nome of ['Subir', 'Descer', 'Remover']) {
      const caixa = await page
        .getByRole('button', { name: `${nome} b.pdf` })
        .boundingBox()
      expect(caixa!.width).toBeGreaterThanOrEqual(44)
      expect(caixa!.height).toBeGreaterThanOrEqual(44)
    }
  })

  for (const tema of ['light', 'dark'] as const)
    test(`todo texto da ferramenta passa de 4,5:1 no tema ${tema}, erros inclusos`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
      await page.goto('/tools/mesclar-pdf')
      await escolherPdfs(page, [
        await pdfDeTeste('ok.pdf', [100]),
        await pdfProtegido('com-senha.pdf'),
      ])
      await expect(page.getByTestId('mesclar-pdf-erro-do-item')).toBeVisible()

      const medidas = await page.evaluate(
        medirContrasteDoTexto,
        '[data-testid="mesclar-pdf"]',
      )
      expect(medidas.length).toBeGreaterThan(8)
      expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
    })
})
