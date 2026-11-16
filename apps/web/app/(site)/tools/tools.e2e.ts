import { test, expect, type Page, type Request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
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
      'pdf',
    ]) {
      await expect(page.locator(`a[href="/tools/${slug}"]`)).toBeVisible()
    }
  })

  test('navega para cada tool pelo card', async ({ page }) => {
    await page.goto('/tools')
    const slugs = ['uuid', 'cpf', 'json', 'base64', 'jwt', 'pdf']
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

async function pdfComTexto(nome: string) {
  const documento = await PDFDocument.create()
  const fonte = await documento.embedFont(StandardFonts.Helvetica)
  for (const texto of ['Contrato', 'Anexo']) {
    documento
      .addPage([300, 300])
      .drawText(texto, { x: 40, y: 150, size: 32, font: fonte })
  }
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

// Em produção a borda da Cloudflare injeta o script do Web Analytics (um GET de outra origem, sem
// corpo) e POST na própria origem (/cdn-cgi/rum e /cdn-cgi/challenge-platform). O que importa:
// fora esse GET, nenhum pedido sai da origem, e nenhum corpo leva o PDF (nem o cabeçalho nem um
// trecho do meio de cada arquivo).
function vigiarPedidos(page: Page) {
  const pedidos: Request[] = []
  page.on('request', (pedido) => pedidos.push(pedido))
  return pedidos
}

const SCRIPT_DA_CLOUDFLARE =
  'https://static.cloudflareinsights.com/beacon.min.js'

function ehOScriptDaCloudflare(pedido: Request) {
  return (
    pedido.method() === 'GET' && pedido.url().startsWith(SCRIPT_DA_CLOUDFLARE)
  )
}

function conferirQueNadaSaiu(
  pedidos: Request[],
  origem: string,
  arquivos: Buffer[],
) {
  const deOutraOrigem = pedidos
    .filter((pedido) => {
      const url = pedido.url()
      return (
        !url.startsWith(`${origem}/`) &&
        !url.startsWith('blob:') &&
        !url.startsWith('data:') &&
        !ehOScriptDaCloudflare(pedido)
      )
    })
    .map((pedido) => `${pedido.method()} ${pedido.url()}`)
  expect(deOutraOrigem).toEqual([])
  const trechos = [
    Buffer.from('%PDF-'),
    ...arquivos.map((arquivo) => {
      const meio = Math.floor(arquivo.length / 2)
      return arquivo.subarray(meio, meio + 64)
    }),
  ]
  const comOArquivo = pedidos.filter((pedido) => {
    const corpo = pedido.postDataBuffer()
    return corpo && trechos.some((trecho) => corpo.includes(trecho))
  })
  expect(comOArquivo.map((pedido) => pedido.url())).toEqual([])
}

const lerPdfBaixado = async (download: { path(): Promise<string | null> }) =>
  PDFDocument.load(readFileSync((await download.path())!))

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
    await page.goto('/tools/pdf/mesclar')
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

  test('nada sai do aparelho: nenhum pedido sai da origem e nenhum corpo leva o PDF', async ({
    page,
  }) => {
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf/mesclar')
    const origem = new URL(page.url()).origin

    const arquivos = [
      await pdfDeTeste('a.pdf', [100]),
      await pdfDeTeste('b.pdf', [200]),
    ]
    await escolherPdfs(page, arquivos)
    await page.getByRole('button', { name: 'Mesclar PDFs' }).click()
    await expect(
      page.getByRole('link', { name: 'Baixar mesclado.pdf' }),
    ).toBeVisible({ timeout: 30_000 })

    conferirQueNadaSaiu(
      pedidos,
      origem,
      arquivos.map((arquivo) => arquivo.buffer),
    )
  })

  test('o pdf-lib só chega com o Worker, depois que a pessoa escolhe um arquivo', async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await page.goto('/tools/pdf/mesclar')
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
    expect(workers).toEqual([])

    await escolherPdfs(page, [await pdfDeTeste('a.pdf', [100])])
    await expect(page.getByTestId('mesclar-pdf-item')).toContainText('1 página')
    expect(workers).toHaveLength(1)
  })

  test('PDF protegido e arquivo que não é PDF ficam com o erro escrito e travam o Mesclar', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/mesclar')
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
    await page.goto('/tools/pdf/mesclar')
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
      await page.goto('/tools/pdf/mesclar')
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

test.describe('Editor de PDF', () => {
  test('/tools/mesclar-pdf responde 308 para /tools/pdf/mesclar', async ({
    page,
  }) => {
    const resposta = await page.request.get('/tools/mesclar-pdf', {
      maxRedirects: 0,
    })
    expect(resposta.status()).toBe(308)
    expect(resposta.headers()['location']).toBe('/tools/pdf/mesclar')
  })

  test('/tools/pdf: aviso de privacidade e um cartão por modo, de 44 px, que o teclado alcança', async ({
    page,
  }) => {
    await page.goto('/tools/pdf')
    await expect(
      page.getByText('Seus arquivos não saem do aparelho'),
    ).toBeVisible()
    const modos = page.getByTestId('pdf-modo')
    await expect(modos).toHaveCount(2)
    await expect(modos.nth(0)).toHaveAttribute('href', '/tools/pdf/mesclar')
    await expect(modos.nth(1)).toHaveAttribute('href', '/tools/pdf/organizar')
    for (const modo of await modos.all()) {
      const caixa = await modo.boundingBox()
      expect(caixa!.height).toBeGreaterThanOrEqual(44)
    }

    await modos.nth(1).focus()
    await expect(modos.nth(1)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/tools/pdf/organizar')
  })

  test('do mesclar para o organizar: o PDF passa pela memória, com as páginas, e o pdf.js só nasce no organizar', async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf/mesclar')
    const origem = new URL(page.url()).origin

    const arquivos = [
      await pdfDeTeste('a.pdf', [100, 101]),
      await pdfDeTeste('b.pdf', [200]),
    ]
    await escolherPdfs(page, arquivos)
    await page.getByRole('button', { name: 'Mesclar PDFs' }).click()
    await expect(
      page.getByRole('link', { name: 'Baixar mesclado.pdf' }),
    ).toBeVisible({ timeout: 30_000 })
    expect(workers).toHaveLength(1)

    await page
      .getByRole('button', { name: 'Organizar as páginas deste PDF' })
      .click()
    await expect(page).toHaveURL('/tools/pdf/organizar')
    await expect(page.getByTestId('organizar-pdf-documento')).toHaveText(
      'mesclado.pdf · 3 páginas',
      { timeout: 30_000 },
    )
    await expect(page.getByTestId('organizar-pdf-rotulo')).toHaveText([
      'Página 1',
      'Página 2',
      'Página 3',
    ])
    // O do mesclar saiu com a página; o organizar lê pelo pdf-lib (um Worker) e desenha pelo pdf.js (outro).
    expect(workers).toHaveLength(3)

    conferirQueNadaSaiu(
      pedidos,
      origem,
      arquivos.map((arquivo) => arquivo.buffer),
    )
  })

  test('organizar: abre um PDF escolhido ali mesmo, com o pdf.js de verdade', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/organizar')
    await escolherPdfs(page, [await pdfDeTeste('contrato.pdf', [100, 200])])
    await expect(page.getByTestId('organizar-pdf-documento')).toHaveText(
      'contrato.pdf · 2 páginas',
      { timeout: 30_000 },
    )
  })
})

test.describe('Editor de PDF: o hub no celular e nos dois temas', () => {
  test('a 320 px, o hub não rola para o lado', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf')
    await expect(page.getByTestId('pdf-modo')).toHaveCount(2)
    const largura = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(largura).toBeLessThanOrEqual(320)
  })

  for (const tema of ['light', 'dark'] as const)
    test(`todo texto do hub passa de 4,5:1 no tema ${tema}`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
      await page.goto('/tools/pdf')
      await expect(page.getByTestId('pdf-modo')).toHaveCount(2)

      const medidas = await page.evaluate(medirContrasteDoTexto, 'main')
      expect(medidas.length).toBeGreaterThan(6)
      expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
    })
})

test.describe('Organizar páginas de PDF', () => {
  async function abrirNoOrganizar(
    page: Page,
    arquivo: { name: string; mimeType: string; buffer: Buffer },
    paginas: number,
  ) {
    await escolherPdfs(page, [arquivo])
    await expect(page.getByTestId('organizar-pdf-documento')).toHaveText(
      `${arquivo.name} · ${paginas} páginas`,
      { timeout: 30_000 },
    )
  }

  test('gira a página 2, apaga a 3, leva a 1 para o fim pelo teclado e baixa o PDF na ordem e com o /Rotate', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/organizar')
    await abrirNoOrganizar(
      page,
      await pdfDeTeste('contrato.pdf', [100, 200, 300, 400]),
      4,
    )

    await page
      .getByRole('button', { name: 'Girar a página 2 à direita' })
      .click()
    await expect(page.getByTestId('organizar-pdf-anuncio')).toHaveText(
      'Página 2 girada para 90°.',
    )
    await page.getByRole('button', { name: 'Apagar a página 3' }).click()
    await expect(
      page.getByRole('checkbox', { name: 'Selecionar página 4' }),
    ).toBeFocused()

    await page.getByRole('checkbox', { name: 'Selecionar página 1' }).focus()
    await page.keyboard.press('Space')
    const depois = page.getByRole('button', { name: 'Mover para depois' })
    await depois.focus()
    await page.keyboard.press('Enter')
    await expect(depois).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('organizar-pdf-rotulo')).toHaveText([
      'Página 2',
      'Página 4',
      'Página 1',
    ])
    await expect(
      page.getByRole('button', { name: 'Mover para antes' }),
    ).toBeFocused()

    // A barra é um ponto só no Tab, e o Gerar vem logo depois dela, antes das páginas.
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('button', { name: 'Gerar PDF organizado' }),
    ).toBeFocused()
    await page.keyboard.press('Enter')
    const baixar = page.getByRole('link', {
      name: 'Baixar contrato-organizado.pdf',
    })
    await expect(baixar).toBeFocused({ timeout: 30_000 })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Enter'),
    ])
    expect(download.suggestedFilename()).toBe('contrato-organizado.pdf')
    const final = await lerPdfBaixado(download)
    expect(final.getPages().map((p) => p.getWidth())).toEqual([200, 400, 100])
    expect(final.getPages().map((p) => p.getRotation().angle)).toEqual([
      90, 0, 0,
    ])
  })

  test('Desfazer pelo Ctrl+Z volta a página apagada', async ({ page }) => {
    await page.goto('/tools/pdf/organizar')
    await abrirNoOrganizar(page, await pdfDeTeste('a.pdf', [100, 200, 300]), 3)

    await page.getByRole('button', { name: 'Apagar a página 2' }).click()
    await expect(page.getByTestId('organizar-pdf-rotulo')).toHaveCount(2)
    await page.keyboard.press('ControlOrMeta+z')

    await expect(page.getByTestId('organizar-pdf-rotulo')).toHaveText([
      'Página 1',
      'Página 2',
      'Página 3',
    ])
    await expect(page.getByTestId('organizar-pdf-anuncio')).toHaveText(
      'Desfeito.',
    )
  })

  test('extrai as páginas selecionadas num PDF novo, com o nome -paginas', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/organizar')
    await abrirNoOrganizar(
      page,
      await pdfDeTeste('relatorio.pdf', [100, 200, 300]),
      3,
    )

    await page.getByRole('checkbox', { name: 'Selecionar página 3' }).check()
    await page.getByRole('checkbox', { name: 'Selecionar página 1' }).check()
    await page.getByRole('button', { name: 'Girar à esquerda' }).click()
    await page.getByRole('button', { name: 'Extrair as selecionadas' }).click()

    const baixar = page.getByRole('link', {
      name: 'Baixar relatorio-paginas.pdf',
    })
    await expect(baixar).toBeFocused({ timeout: 30_000 })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      baixar.click(),
    ])
    expect(download.suggestedFilename()).toBe('relatorio-paginas.pdf')
    const final = await lerPdfBaixado(download)
    expect(final.getPages().map((p) => p.getWidth())).toEqual([100, 300])
    expect(final.getPages().map((p) => p.getRotation().angle)).toEqual([
      270, 270,
    ])
    await expect(page.getByTestId('organizar-pdf-rotulo')).toHaveCount(3)
  })

  test('as miniaturas aparecem, desenhadas pelo pdf.js de verdade', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/organizar')
    await abrirNoOrganizar(page, await pdfDeTeste('a.pdf', [100, 200]), 2)

    const miniaturas = page.getByTestId('organizar-pdf-miniatura')
    await expect(miniaturas).toHaveCount(2, { timeout: 30_000 })
    for (const miniatura of await miniaturas.all()) {
      await expect
        .poll(() =>
          miniatura.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth,
          ),
        )
        .toBeGreaterThan(0)
      expect(await miniatura.getAttribute('alt')).toBe('')
    }

    await page
      .getByRole('button', { name: 'Girar a página 1 à direita' })
      .click()
    await expect(miniaturas.first()).toHaveAttribute('style', /rotate\(90deg\)/)
  })

  // O pdf.js põe em document.fonts uma FontFace para cada fonte que desenha, e só as tira quando o
  // Worker dele responde ao Terminate. Encerrado antes disso, as fontes ficavam na aba até recarregar.
  test('trocar de PDF tira da página as fontes que o pdf.js carregou para o anterior', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/organizar')
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
    const fontes = () => page.evaluate(() => document.fonts.size)
    const antes = await fontes()

    await abrirNoOrganizar(page, await pdfComTexto('contrato.pdf'), 2)
    await expect(page.getByTestId('organizar-pdf-miniatura')).toHaveCount(2, {
      timeout: 30_000,
    })
    await expect.poll(fontes).toBeGreaterThan(antes)

    await abrirNoOrganizar(
      page,
      await pdfDeTeste('branco.pdf', [100, 200, 300]),
      3,
    )
    await expect(page.getByTestId('organizar-pdf-miniatura')).toHaveCount(3, {
      timeout: 30_000,
    })
    await expect.poll(fontes).toBe(antes)
  })

  test('nenhum Worker antes de escolher o PDF; depois, o do pdf-lib e o do pdf.js', async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await page.goto('/tools/pdf/organizar')
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
    expect(workers).toEqual([])

    await abrirNoOrganizar(page, await pdfDeTeste('a.pdf', [100, 200]), 2)
    expect(workers).toHaveLength(2)
  })

  test('PDF protegido: a mesma mensagem do mesclar, e o pdf.js nem nasce', async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await page.goto('/tools/pdf/organizar')
    await escolherPdfs(page, [await pdfProtegido('com-senha.pdf')])

    await expect(page.getByTestId('organizar-pdf-erro')).toHaveText(
      /^Não deu para abrir com-senha\.pdf\. Está protegido por senha/,
    )
    expect(workers).toHaveLength(1)
  })

  test('nada sai do aparelho: abrir, mexer, gerar e extrair sem pedido de fora nem corpo com o PDF', async ({
    page,
  }) => {
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf/organizar')
    const origem = new URL(page.url()).origin

    const arquivo = await pdfDeTeste('a.pdf', [100, 200, 300])
    await abrirNoOrganizar(page, arquivo, 3)
    await expect(page.getByTestId('organizar-pdf-miniatura')).toHaveCount(3, {
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Apagar a página 2' }).click()
    await page.getByRole('button', { name: 'Gerar PDF organizado' }).click()
    await expect(
      page.getByRole('link', { name: 'Baixar a-organizado.pdf' }),
    ).toBeVisible({ timeout: 30_000 })
    await page.getByRole('checkbox', { name: 'Selecionar página 3' }).check()
    await page.getByRole('button', { name: 'Extrair as selecionadas' }).click()
    await expect(
      page.getByRole('link', { name: 'Baixar a-paginas.pdf' }),
    ).toBeVisible({ timeout: 30_000 })

    conferirQueNadaSaiu(pedidos, origem, [arquivo.buffer])
  })

  test('a 320 px, nada rola para o lado e os controles têm 44 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf/organizar')
    await abrirNoOrganizar(
      page,
      await pdfDeTeste(
        'relatorio-trimestral-consolidado-versao-final-revisada-2026.pdf',
        [100, 200, 300],
      ),
      3,
    )
    await page.getByRole('checkbox', { name: 'Selecionar página 2' }).check()

    const largura = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(largura).toBeLessThanOrEqual(320)
    const alvos = [
      page.getByTestId('organizar-pdf-selecao').first(),
      page.getByRole('button', { name: 'Girar a página 1 à direita' }),
      page.getByRole('button', { name: 'Apagar a página 1' }),
      ...(await page
        .getByTestId('organizar-pdf-barra')
        .getByRole('button')
        .all()),
      page.getByRole('button', { name: 'Gerar PDF organizado' }),
    ]
    for (const alvo of alvos) {
      const caixa = await alvo.boundingBox()
      expect(caixa!.width).toBeGreaterThanOrEqual(44)
      expect(caixa!.height).toBeGreaterThanOrEqual(44)
    }
  })

  for (const tema of ['light', 'dark'] as const)
    test(`todo texto do organizar passa de 4,5:1 no tema ${tema}`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
      await page.goto('/tools/pdf/organizar')
      await abrirNoOrganizar(page, await pdfDeTeste('a.pdf', [100, 200]), 2)
      await page
        .getByRole('button', { name: 'Girar a página 1 à direita' })
        .click()
      await page.getByRole('checkbox', { name: 'Selecionar página 2' }).check()
      await page.getByRole('button', { name: 'Gerar PDF organizado' }).click()
      await expect(page.getByTestId('organizar-pdf-baixar')).toBeVisible({
        timeout: 30_000,
      })

      const medidas = await page.evaluate(
        medirContrasteDoTexto,
        '[data-testid="organizar-pdf"]',
      )
      expect(medidas.length).toBeGreaterThan(15)
      expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
    })
})
