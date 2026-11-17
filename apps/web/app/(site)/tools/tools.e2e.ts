import { test, expect, type Page, type Request } from '@playwright/test'
import type { AxeResults, RunOptions } from 'axe-core'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import {
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
  StandardFonts,
  beginText,
  concatTransformationMatrix,
  decodePDFRawStream,
  degrees,
  drawObject,
  endText,
  fill,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFillingRgbColor,
  setFontAndSize,
  setTextMatrix,
  showText,
} from 'pdf-lib'
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

// Host, caminho e query exatos: um GET não tem corpo, então a própria URL é o único jeito de dado
// sair por ele. O caminho de produção leva um sufixo de versão (/beacon.min.js/vce70…), curto: com
// até 80 caracteres, nem esse sufixo vira canal para um trecho do arquivo.
function ehOScriptDaCloudflare(pedido: Request) {
  if (pedido.method() !== 'GET') return false
  const url = new URL(pedido.url())
  return (
    url.origin === 'https://static.cloudflareinsights.com' &&
    url.search === '' &&
    url.hash === '' &&
    /^\/beacon\.min\.js(\/[A-Za-z0-9]{1,80})?$/.test(url.pathname)
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

  // O Assinar saiu do site a pedido do dono: quem tinha o link cai no hub.
  test('/tools/pdf/assinar responde 308 para /tools/pdf', async ({ page }) => {
    const resposta = await page.request.get('/tools/pdf/assinar', {
      maxRedirects: 0,
    })
    expect(resposta.status()).toBe(308)
    expect(resposta.headers()['location']).toBe('/tools/pdf')
  })

  test('/tools/pdf: aviso de privacidade e um cartão por modo, de 44 px, que o teclado alcança', async ({
    page,
  }) => {
    await page.goto('/tools/pdf')
    await expect(
      page.getByText('Seus arquivos não saem do aparelho'),
    ).toBeVisible()
    const modos = page.getByTestId('pdf-modo')
    await expect(modos).toHaveCount(3)
    await expect(modos.nth(0)).toHaveAttribute('href', '/tools/pdf/mesclar')
    await expect(modos.nth(1)).toHaveAttribute('href', '/tools/pdf/organizar')
    await expect(modos.nth(2)).toHaveAttribute('href', '/tools/pdf/editar')
    await expect(page.locator('a[href="/tools/pdf/assinar"]')).toHaveCount(0)
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
    await expect(page.getByTestId('pdf-modo')).toHaveCount(3)
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
      await expect(page.getByTestId('pdf-modo')).toHaveCount(3)

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

// Uma imagem 8×8 vermelha em JPEG 2000 (o codestream, sem a caixa JP2), gerada pelo sips do macOS. O
// pdf.js só a decodifica com o openjpeg.wasm, servido da própria origem desde a fase 3.
const J2K_VERMELHO = Buffer.from(
  '/0//UQAvAAAAAAAIAAAACAAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAADBwEBBwEBBwEB/1IADAAAAAEBBQQEAAD/XAAjIncedup26na8bwBvAG7iZ0xnTGdkUANQA1BFV9JX0ldh/2QAEQABS2FrYWR1LXY1LjIuMf+QAAoAAAAAACsAAf+Tx/AGCdJvxwIFz7wIAGyAgICAgICAgICAgICAgID/2Q==',
  'base64',
)

// Páginas de 300 pontos com a imagem no meio (de 50 a 250), ocupando o centro da página.
async function pdfComJpeg2000(nome: string, paginas = 2) {
  const documento = await PDFDocument.create()
  const imagem = documento.context.register(
    documento.context.stream(J2K_VERMELHO, {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 8,
      Height: 8,
      Filter: 'JPXDecode',
    }),
  )
  for (let i = 0; i < paginas; i++) {
    const pagina = documento.addPage([300, 300])
    pagina.node.setXObject(PDFName.of('Im0'), imagem)
    pagina.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(200, 0, 0, 200, 50, 50),
      drawObject('Im0'),
      popGraphicsState(),
    )
  }
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await documento.save()),
  }
}

async function abrirNoEditar(
  page: Page,
  arquivo: { name: string; mimeType: string; buffer: Buffer },
) {
  await escolherPdfs(page, [arquivo])
  await expect(page.getByTestId('editar-pdf-canvas')).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByTestId('editar-pdf-desenhando')).toHaveCount(0)
}

const ehVermelho = ([r, g, b]: number[]) => r > 200 && g < 40 && b < 40

// Em pontos da tela (a página como o pdf.js a mostra, origem em cima à esquerda).
const TARJA = { x: 40, y: 90, largura: 120, altura: 60 }
const CPF = { texto: 'CPF 123.456.789-00', x: 40, linhaDeBase: 60, tamanho: 16 }

// Três páginas que aparecem iguais na tela (300 × 200 pontos, com a tarja preta, o CPF e um link), cada
// uma guardada de um jeito: normal, com /Rotate 90 e com o CropBox deslocado da MediaBox. Cada uma
// desenha pelo `cm` que leva a tela ao espaço do PDF, então o mesmo ponto da tela é outro no arquivo.
async function pdfDosTresFormatos(nome: string) {
  const documento = await PDFDocument.create()
  const fonte = await documento.embedFont(StandardFonts.Helvetica)
  const formatos: {
    lados: [number, number]
    giro?: number
    recorte?: [number, number, number, number]
    tela: [number, number, number, number, number, number]
  }[] = [
    { lados: [300, 200], tela: [1, 0, 0, -1, 0, 200] },
    { lados: [200, 300], giro: 90, tela: [0, 1, 1, 0, 0, 0] },
    {
      lados: [400, 300],
      recorte: [60, 50, 300, 200],
      tela: [1, 0, 0, -1, 60, 250],
    },
  ]
  for (const { lados, giro, recorte, tela } of formatos) {
    const pagina = documento.addPage(lados)
    if (giro) pagina.setRotation(degrees(giro))
    if (recorte) pagina.setCropBox(...recorte)
    const nomeDaFonte = pagina.node.newFontDictionary('F1', fonte.ref)
    pagina.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...tela),
      setFillingRgbColor(0, 0, 0),
      rectangle(TARJA.x, TARJA.y, TARJA.largura, TARJA.altura),
      fill(),
      beginText(),
      setFontAndSize(nomeDaFonte, CPF.tamanho),
      setTextMatrix(1, 0, 0, -1, CPF.x, CPF.linhaDeBase),
      showText(fonte.encodeText(CPF.texto)),
      endText(),
      popGraphicsState(),
    )
    const link = documento.context.register(
      documento.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [0, 0, 40, 40],
        Border: [0, 0, 0],
        A: { S: 'URI', URI: PDFString.of('https://exemplo.com.br/cpf') },
      }),
    )
    pagina.node.set(PDFName.of('Annots'), documento.context.obj([link]))
  }
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await documento.save()),
  }
}

// Um PNG RGB com degradê, montado à mão (assinatura, IHDR, IDAT e IEND), para o conteúdo dele ser único.
function pngDeTeste(nome: string, largura: number, altura: number) {
  const linhas = Array.from({ length: altura }, (_, y) =>
    Buffer.from([
      0,
      ...Array.from({ length: largura }, (_, x) => [
        (x * 251) / largura,
        (y * 251) / altura,
        128,
      ]).flat(),
    ]),
  )
  const bloco = (tipo: string, dados: Buffer) => {
    const tamanho = Buffer.alloc(4)
    tamanho.writeUInt32BE(dados.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
    const soma = Buffer.alloc(4)
    soma.writeUInt32BE(crc32(corpo))
    return Buffer.concat([tamanho, corpo, soma])
  }
  const cabecalho = Buffer.alloc(13)
  cabecalho.writeUInt32BE(largura, 0)
  cabecalho.writeUInt32BE(altura, 4)
  cabecalho.set([8, 2, 0, 0, 0], 8)
  return {
    name: nome,
    mimeType: 'image/png',
    buffer: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      bloco('IHDR', cabecalho),
      bloco('IDAT', deflateSync(Buffer.concat(linhas))),
      bloco('IEND', Buffer.alloc(0)),
    ]),
  }
}

type CaixaLida = [number, number, number, number]

type PaginaLida = {
  largura: number
  altura: number
  textos: { str: string; matriz: number[] }[]
  desenhos: {
    tipo: 'caminho' | 'imagem'
    caixa: CaixaLida
    preenchimento: string | null
    opacidade: number
    mistura: string | null
  }[]
}

function caixaTransformada(
  minMax: ArrayLike<number>,
  [a, b, c, d, e, f]: number[],
): CaixaLida {
  const [x1, y1, x2, y2] = Array.from(minMax)
  const cantos = [
    [x1, y1],
    [x2, y1],
    [x1, y2],
    [x2, y2],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f])
  const xs = cantos.map((p) => p[0])
  const ys = cantos.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// O PDF lido pelo pdf.js (build legacy, no Node), em pontos da tela: o texto (str e a matriz já com a
// vista) e cada desenho (a caixa de cada caminho e de cada imagem, com a cor, a opacidade e a mistura).
async function lerComPdfjs(bytes: Uint8Array): Promise<PaginaLida[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { OPS, Util } = pdfjs
  const tarefa = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: path.join(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'standard_fonts/',
    ),
    useWorkerFetch: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  })
  try {
    const documento = await tarefa.promise
    const paginas: PaginaLida[] = []
    for (let numero = 1; numero <= documento.numPages; numero++) {
      const pagina = await documento.getPage(numero)
      const vista = pagina.getViewport({ scale: 1 })
      const conteudo = await pagina.getTextContent()
      const operadores = await pagina.getOperatorList()
      type Estado = {
        ctm: number[]
        preenchimento: string | null
        opacidade: number
        mistura: string | null
      }
      let estado: Estado = {
        ctm: vista.transform,
        preenchimento: null,
        opacidade: 1,
        mistura: null,
      }
      const pilha: Estado[] = []
      const desenhos: PaginaLida['desenhos'] = []
      operadores.fnArray.forEach((fn, i) => {
        const args = operadores.argsArray[i]
        if (fn === OPS.save) {
          pilha.push(estado)
          estado = { ...estado }
        } else if (fn === OPS.restore) {
          estado = pilha.pop() ?? estado
        } else if (fn === OPS.transform) {
          estado.ctm = Util.transform(estado.ctm, args)
        } else if (fn === OPS.setFillRGBColor) {
          estado.preenchimento = String(args[0])
        } else if (fn === OPS.setGState) {
          for (const [chave, valor] of args[0]) {
            if (chave === 'ca') estado.opacidade = valor
            if (chave === 'BM') estado.mistura = String(valor)
          }
        } else if (fn === OPS.constructPath && args[2]) {
          desenhos.push({
            tipo: 'caminho',
            caixa: caixaTransformada(args[2], estado.ctm),
            preenchimento: estado.preenchimento,
            opacidade: estado.opacidade,
            mistura: estado.mistura,
          })
        } else if (fn === OPS.paintImageXObject) {
          desenhos.push({
            tipo: 'imagem',
            caixa: caixaTransformada([0, 0, 1, 1], estado.ctm),
            preenchimento: null,
            opacidade: estado.opacidade,
            mistura: estado.mistura,
          })
        }
      })
      paginas.push({
        largura: vista.width,
        altura: vista.height,
        textos: conteudo.items
          .filter((item) => 'str' in item && item.str.trim())
          .map((item) => {
            const { str, transform } = item as {
              str: string
              transform: number[]
            }
            return { str, matriz: Util.transform(vista.transform, transform) }
          }),
        desenhos,
      })
    }
    return paginas
  } finally {
    await tarefa.destroy()
  }
}

function conferirCaixa(
  atual: readonly number[],
  esperada: readonly number[],
  folga: number,
) {
  const arredondar = (n: number) => Math.round(n * 100) / 100
  expect(
    atual.every((valor, i) => Math.abs(valor - esperada[i]) <= folga),
    `${JSON.stringify(atual.map(arredondar))} deveria estar a até ${folga} de ${JSON.stringify(esperada)}`,
  ).toBe(true)
}

// O JPEG que o "apagar de verdade" pôs no lugar da página: o único XObject de imagem DCT dela.
function jpegDaPagina(pdf: PDFDocument, indice: number): Buffer {
  const xobjetos = pdf
    .getPage(indice)
    .node.Resources()
    ?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  const jpegs = (xobjetos?.entries() ?? [])
    .map(([, ref]) => pdf.context.lookup(ref))
    .filter(
      (objeto): objeto is PDFRawStream =>
        objeto instanceof PDFRawStream &&
        objeto.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode'),
    )
  expect(jpegs).toHaveLength(1)
  return Buffer.from(jpegs[0].contents)
}

// Decodifica o JPEG no navegador (createImageBitmap) e lê a cor de cada ponto, dado em fração da página.
async function coresDoJpeg(
  page: Page,
  jpeg: Buffer,
  pontos: (readonly [number, number])[],
) {
  return page.evaluate(
    async ({ base64, pontos }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/jpeg' }),
      )
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const contexto = canvas.getContext('2d', { willReadFrequently: true })!
      contexto.drawImage(bitmap, 0, 0)
      bitmap.close()
      return {
        largura: canvas.width,
        altura: canvas.height,
        cores: pontos.map(([x, y]) =>
          Array.from(
            contexto.getImageData(
              Math.floor(x * canvas.width),
              Math.floor(y * canvas.height),
              1,
              1,
            ).data,
          ),
        ),
      }
    },
    { base64: jpeg.toString('base64'), pontos },
  )
}

// Duas páginas; o dado da página 1 também está no XFA (o que foi digitado no formulário), no texto
// alternativo e no título de um elemento de estrutura pai, sem /Pg, e num marcador que leva a ela.
async function pdfComOsDadosForaDaPagina(nome: string) {
  const documento = await PDFDocument.create({ updateMetadata: false })
  const { context } = documento
  const fonte = await documento.embedFont(StandardFonts.Helvetica)
  const [pagina1, pagina2] = [
    documento.addPage([300, 200]),
    documento.addPage([300, 200]),
  ]
  pagina1.drawText('CPF 123.456.789-00', {
    x: 40,
    y: 140,
    size: 16,
    font: fonte,
  })
  pagina2.drawText('Fica', { x: 40, y: 140, size: 16, font: fonte })
  documento.catalog.set(
    PDFName.of('AcroForm'),
    context.obj({
      Fields: [],
      XFA: [
        PDFString.of('datasets'),
        context.register(
          context.stream('<dados><cpf>XFA_CPF_999</cpf></dados>'),
        ),
      ],
    }),
  )
  const filho = context.register(
    context.obj({ Type: 'StructElem', S: 'P', Pg: pagina1.ref }),
  )
  const pai = context.register(
    context.obj({
      Type: 'StructElem',
      S: 'Sect',
      Alt: PDFString.of('ALT_PAI_CPF'),
      T: PDFString.of('T_PAI_CPF'),
      K: [filho],
    }),
  )
  documento.catalog.set(
    PDFName.of('StructTreeRoot'),
    context.register(context.obj({ Type: 'StructTreeRoot', K: [pai] })),
  )
  const raiz = context.nextRef()
  const [cpf, fica] = [context.nextRef(), context.nextRef()]
  context.assign(
    cpf,
    context.obj({
      Title: PDFString.of('MARCADOR_CPF'),
      Parent: raiz,
      Next: fica,
      Dest: [pagina1.ref, 'Fit'],
    }),
  )
  context.assign(
    fica,
    context.obj({
      Title: PDFString.of('MARCADOR_FICA'),
      Parent: raiz,
      Prev: cpf,
      Dest: [pagina2.ref, 'Fit'],
    }),
  )
  context.assign(
    raiz,
    context.obj({ Type: 'Outlines', First: cpf, Last: fica, Count: 2 }),
  )
  documento.catalog.set(PDFName.of('Outlines'), raiz)
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await documento.save()),
  }
}

// Tudo o que o arquivo guarda, com os streams descomprimidos.
async function todoOConteudoDoPdf(bytes: Uint8Array) {
  const documento = await PDFDocument.load(bytes, { updateMetadata: false })
  const partes: string[] = []
  for (const [, objeto] of documento.context.enumerateIndirectObjects()) {
    partes.push(objeto.toString())
    if (objeto instanceof PDFRawStream) {
      let dados: Uint8Array
      try {
        dados = decodePDFRawStream(objeto).decode()
      } catch {
        dados = objeto.contents
      }
      partes.push(Buffer.from(dados).toString('latin1'))
    }
  }
  return partes.join('\n')
}

const ehBranco = ([r, g, b]: number[]) => r >= 225 && g >= 225 && b >= 225
const ehEscuro = ([r, g, b]: number[]) => r <= 70 && g <= 70 && b <= 70

async function abrirPagina(page: Page, numero: number, total: number) {
  await page
    .getByRole('button', { name: `Página ${numero}`, exact: true })
    .click()
  await expect(page.getByTestId('editar-pdf-posicao')).toHaveText(
    `Página ${numero} de ${total}`,
  )
  await expect(page.getByTestId('editar-pdf-desenhando')).toHaveCount(0)
  await expect(page.getByTestId('editar-pdf-quadro')).toBeVisible()
}

async function inserirNoCentro(page: Page, ferramenta: string) {
  await page
    .getByTestId('editar-pdf-ferramentas')
    .getByRole('button', { name: ferramenta, exact: true })
    .click()
  await page.getByRole('button', { name: 'Inserir no centro' }).click()
  await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(/^Inserido: /)
}

// Pelo painel, o jeito exato: primeiro no canto, para a largura e a altura caberem sem parar na borda.
async function posicionar(
  page: Page,
  caixa: { x: number; y: number; largura?: number; altura?: number },
) {
  const campo = (nome: string) => page.getByTestId(`editar-pdf-campo-${nome}`)
  await campo('x').fill('0')
  await campo('y').fill('0')
  if (caixa.largura !== undefined) {
    await campo('largura').fill(String(caixa.largura))
  }
  if (caixa.altura !== undefined) {
    await campo('altura').fill(String(caixa.altura))
  }
  await campo('x').fill(String(caixa.x))
  await campo('y').fill(String(caixa.y))
}

async function caixaDoPainel(page: Page) {
  const valor = async (nome: string) =>
    Number(await page.getByTestId(`editar-pdf-campo-${nome}`).inputValue())
  return {
    x: await valor('x'),
    y: await valor('y'),
    largura: await valor('largura'),
    altura: await valor('altura'),
  }
}

async function gerarEBaixar(page: Page) {
  await page.getByRole('button', { name: 'Gerar PDF editado' }).click()
  const baixar = page.getByTestId('editar-pdf-baixar')
  await expect(baixar).toBeFocused({ timeout: 30_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    baixar.click(),
  ])
  return {
    nome: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await download.path())!)),
  }
}

async function escolherImagem(
  page: Page,
  imagem: { name: string; mimeType: string; buffer: Buffer },
) {
  const [escolha] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .getByTestId('editar-pdf-ferramentas')
      .getByRole('button', { name: 'Imagem', exact: true })
      .click(),
  ])
  await escolha.setFiles(imagem)
}

// Num traço do ponteiro, de um ponto a outro da página (em fração dela), com passos no meio.
async function riscar(page: Page, pontos: (readonly [number, number])[]) {
  const quadro = page.getByTestId('editar-pdf-quadro')
  await quadro.scrollIntoViewIfNeeded()
  const caixa = (await quadro.boundingBox())!
  const naTela = ([x, y]: readonly [number, number]) =>
    [caixa.x + x * caixa.width, caixa.y + y * caixa.height] as const
  await page.mouse.move(...naTela(pontos[0]))
  await page.mouse.down()
  for (const ponto of pontos.slice(1)) {
    await page.mouse.move(...naTela(ponto), { steps: 8 })
  }
  await page.mouse.up()
}

async function violacoesDoAxe(page: Page, seletor: string) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  return page.evaluate(async (alvo) => {
    const { axe } = window as unknown as {
      axe: { run: (alvo: Element, opcoes: RunOptions) => Promise<AxeResults> }
    }
    const { violations } = await axe.run(document.querySelector(alvo)!, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    })
    return violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      )
  }, seletor)
}

function xfaDe(documento: PDFDocument) {
  const { context } = documento
  const xml = (conteudo: string) => context.register(context.stream(conteudo))
  return context.obj([
    PDFString.of('template'),
    xml('<template><field name="nome"/></template>'),
    PDFString.of('datasets'),
    xml('<xfa:datasets><nome>Maria</nome></xfa:datasets>'),
  ])
}

// Um formulário híbrido: um campo de texto no AcroForm e a versão XFA, com o /NeedsRendering. O XFA entra
// num segundo save sem as aparências, porque o save padrão passa pelo getForm(), que tira o XFA.
async function pdfHibrido(nome: string) {
  const documento = await PDFDocument.create()
  const pagina = documento.addPage([400, 500])
  const campo = documento.getForm().createTextField('pessoa.nome')
  campo.setText('Maria')
  campo.addToPage(pagina, { x: 40, y: 430, width: 220, height: 24 })
  const comXfa = await PDFDocument.load(await documento.save())
  comXfa.catalog
    .lookup(PDFName.of('AcroForm'), PDFDict)
    .set(PDFName.of('XFA'), xfaDe(comXfa))
  comXfa.catalog.set(PDFName.of('NeedsRendering'), PDFBool.True)
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await comXfa.save({ updateFieldAppearances: false })),
  }
}

test.describe('Editar PDF', () => {
  test('imagem em JPEG 2000 aparece na página grande e na miniatura, com o decodificador da própria origem, sem 404', async ({
    page,
  }) => {
    const respostas: string[] = []
    page.on('response', (resposta) => {
      if (!resposta.url().startsWith('blob:')) {
        respostas.push(
          `${resposta.status()} ${new URL(resposta.url()).pathname}`,
        )
      }
    })
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfComJpeg2000('escaneado.pdf'))

    const centroDaPagina = await page
      .getByTestId('editar-pdf-canvas')
      .evaluate((canvas: HTMLCanvasElement) =>
        Array.from(
          canvas
            .getContext('2d')!
            .getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data,
        ),
      )
    expect(ehVermelho(centroDaPagina)).toBe(true)
    const miniatura = page.getByTestId('editar-pdf-miniatura-imagem').first()
    await expect(miniatura).toBeVisible({ timeout: 30_000 })
    const centroDaMiniatura = await miniatura.evaluate(
      async (imagem: HTMLImageElement) => {
        await imagem.decode()
        const canvas = document.createElement('canvas')
        canvas.width = imagem.naturalWidth
        canvas.height = imagem.naturalHeight
        const contexto = canvas.getContext('2d')!
        contexto.drawImage(imagem, 0, 0)
        return Array.from(
          contexto.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1)
            .data,
        )
      },
    )
    expect(ehVermelho(centroDaMiniatura)).toBe(true)
    expect(respostas).toContainEqual(
      expect.stringMatching(/^200 \/pdfjs\/[\d.]+\/wasm\/openjpeg\.wasm$/),
    )
    expect(respostas.filter((r) => !/^[23]/.test(r))).toEqual([])
  })

  test('nenhum Worker antes de escolher o PDF; depois, o do pdf-lib e o do pdf.js, e gerar com apagar de verdade não cria outro', async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await page.goto('/tools/pdf/editar')
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
    expect(workers).toEqual([])

    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 300]))
    expect(workers).toHaveLength(2)

    await inserirNoCentro(page, 'Cobrir')
    await page
      .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
      .click()
    await page
      .getByRole('button', { name: 'Apagar de verdade nesta página' })
      .click()
    await gerarEBaixar(page)
    expect(workers).toHaveLength(2)
  })

  test('texto: escreve, move pelo teclado e salva; no PDF baixado, o texto fica onde a tela mostrou, também com /Rotate 90 e com CropBox deslocado', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfDosTresFormatos('formatos.pdf'))

    const conteudos = ['Contrato Ação', 'Página girada', 'Recorte é aqui']
    const naTela: { x: number; y: number }[] = []
    for (const [indice, conteudo] of conteudos.entries()) {
      await abrirPagina(page, indice + 1, 3)
      await inserirNoCentro(page, 'Texto')
      const campo = page.getByTestId('editar-pdf-campo-texto')
      await expect(campo).toBeFocused()
      await page.keyboard.type(conteudo)
      await expect(campo).toHaveValue(conteudo)
      await posicionar(page, { x: 100, y: 120 })

      const objeto = page.getByTestId('editar-pdf-objeto')
      await objeto.focus()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Shift+ArrowDown')
      await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
        /^Em 102 por 130, \d+ por \d+ pontos, letra de 16 pontos\.\s*$/,
      )
      await expect(objeto).toBeFocused()
      const linha = page.locator(
        '[data-testid="editar-pdf-desenho"][data-tipo="texto"] text',
      )
      await expect(linha).toHaveText(conteudo)
      naTela.push({
        x: Number(await linha.getAttribute('x')),
        y: Number(await linha.getAttribute('y')),
      })
    }
    expect(naTela[0].x).toBe(102)

    const { nome, bytes } = await gerarEBaixar(page)
    expect(nome).toBe('formatos-editado.pdf')
    const paginas = await lerComPdfjs(bytes)
    expect(paginas.map((p) => [p.largura, p.altura])).toEqual([
      [300, 200],
      [300, 200],
      [300, 200],
    ])
    for (const [indice, conteudo] of conteudos.entries()) {
      const lido = paginas[indice].textos.find((t) => t.str === conteudo)
      expect(lido, `texto da página ${indice + 1}`).toBeDefined()
      // De pé, na letra de 16 pontos, e com a linha de base onde a tela a desenhou.
      conferirCaixa(
        lido!.matriz,
        [16, 0, 0, -16, naTela[indice].x, naTela[indice].y],
        0.05,
      )
    }
  })

  test('imagem PNG numa página com CropBox deslocado: escolhe, põe no centro e salva; no PDF baixado, a imagem ocupa a caixa da tela', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfDosTresFormatos('formatos.pdf'))
    await abrirPagina(page, 3, 3)

    await escolherImagem(page, pngDeTeste('logo.png', 40, 30))
    await expect(page.getByTestId('editar-pdf-estado-imagem')).toHaveText(
      'logo.png, 40 por 30 pixels.',
    )
    await page.getByRole('button', { name: 'Inserir no centro' }).click()
    const objeto = page.getByTestId('editar-pdf-objeto')
    await expect(objeto).toBeFocused()
    await expect(objeto).toHaveAccessibleName(
      /^Imagem logo\.png, em \d+ por \d+, 30 por 23 pontos$/,
    )
    await posicionar(page, { x: 200, y: 20 })
    const caixa = await caixaDoPainel(page)
    expect(caixa).toEqual({ x: 200, y: 20, largura: 30, altura: 22.5 })

    const { bytes } = await gerarEBaixar(page)
    const imagens = (await lerComPdfjs(bytes))[2].desenhos.filter(
      (d) => d.tipo === 'imagem',
    )
    expect(imagens).toHaveLength(1)
    conferirCaixa(imagens[0].caixa, [200, 20, 230, 42.5], 0.05)
    const final = await PDFDocument.load(bytes)
    expect(final.getPage(2).getCropBox()).toEqual({
      x: 60,
      y: 50,
      width: 300,
      height: 200,
    })
  })

  test('marca-texto numa página com /Rotate 90: no PDF baixado, um retângulo amarelo com opacidade 0,35 e multiplicar, na caixa da tela', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfDosTresFormatos('formatos.pdf'))
    await abrirPagina(page, 2, 3)

    await inserirNoCentro(page, 'Marca-texto')
    await posicionar(page, { x: 36, y: 44, largura: 160, altura: 22 })
    await expect(page.getByTestId('editar-pdf-painel-nome')).toHaveText(
      'Marca-texto, em 36 por 44, 160 por 22 pontos',
    )
    await expect(
      page.locator(
        '[data-testid="editar-pdf-desenho"][data-tipo="marca-texto"]',
      ),
    ).toHaveCSS('mix-blend-mode', 'multiply')

    const { bytes } = await gerarEBaixar(page)
    const marcas = (await lerComPdfjs(bytes))[1].desenhos.filter(
      (d) => d.preenchimento === '#facc15',
    )
    expect(marcas).toHaveLength(1)
    expect(marcas[0]).toMatchObject({ opacidade: 0.35, mistura: 'multiply' })
    conferirCaixa(marcas[0].caixa, [36, 44, 196, 66], 0.05)
    const final = await PDFDocument.load(bytes)
    expect(final.getPage(1).getRotation().angle).toBe(90)
  })

  test('desenho com o ponteiro: o traço fica onde o mouse passou, e o PDF baixado tem o mesmo traço, na cor do desenho', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfDosTresFormatos('formatos.pdf'))
    await page.getByRole('button', { name: 'Diminuir o zoom' }).click()
    await page.getByRole('button', { name: 'Diminuir o zoom' }).click()
    await expect(page.getByTestId('editar-pdf-zoom')).toHaveText('50%')
    await expect(page.getByTestId('editar-pdf-desenhando')).toHaveCount(0)

    await page
      .getByTestId('editar-pdf-ferramentas')
      .getByRole('button', { name: 'Desenhar', exact: true })
      .click()
    await expect(page.getByTestId('editar-pdf-desenho-ativo')).toBeVisible()
    await expect(page.getByTestId('editar-pdf-quadro')).toHaveCSS(
      'touch-action',
      'none',
    )
    // Em pontos: de (60, 60) desce até (180, 100) e sobe até (210, 60).
    await riscar(page, [
      [0.2, 0.3],
      [0.6, 0.5],
      [0.7, 0.3],
    ])
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      /^Inserido: Desenho, em \d+ por \d+, \d+ por \d+ pontos\.\s*$/,
    )
    await expect(
      page
        .getByTestId('editar-pdf-ferramentas')
        .getByRole('button', { name: 'Desenhar', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')

    // Na tela, o contorno do traço (em pontos da página) passa pelos pontos do mouse; a suavização do
    // perfect-freehand corta um pouco a ponta da curva de baixo.
    const naTela = await page
      .locator('[data-testid="editar-pdf-desenho"][data-tipo="traco"] path')
      .evaluate((caminho: SVGPathElement) => {
        const { x, y, width, height } = caminho.getBBox()
        return [x, y, x + width, y + height]
      })
    conferirCaixa(naTela, [60, 60, 210, 100], 4)

    const { bytes } = await gerarEBaixar(page)
    const tracos = (await lerComPdfjs(bytes))[0].desenhos.filter(
      (d) => d.preenchimento === '#1d4ed8',
    )
    expect(tracos).toHaveLength(1)
    conferirCaixa(tracos[0].caixa, naTela, 0.1)
  })

  test('cobrir sem apagar: o retângulo branco vai por cima, e o texto continua no arquivo', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfDosTresFormatos('formatos.pdf'))

    await page
      .getByTestId('editar-pdf-ferramentas')
      .getByRole('button', { name: 'Cobrir', exact: true })
      .click()
    await expect(page.getByTestId('editar-pdf-aviso-cobrir')).toHaveText(
      /mas o texto continua no arquivo/,
    )
    await page.getByRole('button', { name: 'Inserir no centro' }).click()
    await posicionar(page, { x: 32, y: 40, largura: 68, altura: 80 })
    await expect(
      page.getByRole('group', { name: 'Cobrir nesta página' }),
    ).toContainText('o texto continua no arquivo')
    await expect(page.getByTestId('editar-pdf-paginas-apagadas')).toHaveCount(0)

    const { bytes } = await gerarEBaixar(page)
    const [primeira] = await lerComPdfjs(bytes)
    expect(primeira.textos.map((t) => t.str)).toContain(CPF.texto)
    const brancos = primeira.desenhos.filter(
      (d) => d.preenchimento === '#ffffff',
    )
    expect(brancos).toHaveLength(1)
    conferirCaixa(brancos[0].caixa, [32, 40, 100, 120], 0.05)
  })

  test('apagar de verdade, com /Rotate 90 e com CropBox deslocado: o texto some, a página fica sem /Annots e, no JPEG, branco sob o retângulo e a tinta logo fora dele', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const original = await pdfDosTresFormatos('formatos.pdf')
    // As três páginas mostram o CPF e a tarja no mesmo lugar da tela, apesar da rotação e do recorte.
    for (const pagina of await lerComPdfjs(original.buffer)) {
      expect(pagina.textos).toHaveLength(1)
      conferirCaixa(
        pagina.textos[0].matriz,
        [16, 0, 0, -16, CPF.x, CPF.linhaDeBase],
        0.01,
      )
      conferirCaixa(
        pagina.desenhos[0].caixa,
        [TARJA.x, TARJA.y, TARJA.x + TARJA.largura, TARJA.y + TARJA.altura],
        0.01,
      )
    }

    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, original)
    // Cobre o começo do CPF e o canto de cima à esquerda da tarja: a borda direita (x = 100) e a de
    // baixo (y = 120) caem no meio da tinta.
    const cobrir = { x: 32, y: 40, largura: 68, altura: 80 }
    for (const numero of [2, 3]) {
      await abrirPagina(page, numero, 3)
      await inserirNoCentro(page, 'Cobrir')
      await posicionar(page, cobrir)
      await page
        .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
        .click()
      const confirmar = page.getByRole('button', {
        name: 'Apagar de verdade nesta página',
      })
      await expect(confirmar).toBeFocused()
      await expect(page.getByTestId('editar-pdf-explicacao')).toContainText(
        'A página vira uma imagem',
      )
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('editar-pdf-apagar-ligado')).toBeVisible()
    }
    await expect(page.getByTestId('editar-pdf-paginas-apagadas')).toHaveText(
      'Para apagar de verdade, as páginas 2 e 3 vão virar imagem.',
    )

    const { bytes } = await gerarEBaixar(page)
    const lidas = await lerComPdfjs(bytes)
    expect(lidas[0].textos.map((t) => t.str)).toEqual([CPF.texto])
    expect(lidas[1].textos).toEqual([])
    expect(lidas[2].textos).toEqual([])

    const final = await PDFDocument.load(bytes)
    const anotacoes = (indice: number) =>
      final.getPage(indice).node.get(PDFName.of('Annots'))
    expect(anotacoes(0)).toBeDefined()
    const pontos = [
      // Dentro do retângulo, sobre a tarja e o CPF, e perto das bordas.
      [70, 105],
      [97, 117],
      [60, 55],
      // Logo fora, à direita e embaixo, sobre a tarja.
      [103, 105],
      [70, 123],
      // A tarja longe do retângulo, e o fundo da página.
      [150, 140],
      [250, 180],
    ] as const
    for (const indice of [1, 2]) {
      expect(anotacoes(indice)).toBeUndefined()
      expect(final.getPage(indice).getRotation().angle).toBe(0)
      expect(final.getPage(indice).getSize()).toEqual({
        width: 300,
        height: 200,
      })
      const imagens = lidas[indice].desenhos.filter((d) => d.tipo === 'imagem')
      expect(imagens).toHaveLength(1)
      conferirCaixa(imagens[0].caixa, [0, 0, 300, 200], 0.05)

      const { largura, altura, cores } = await coresDoJpeg(
        page,
        jpegDaPagina(final, indice),
        pontos.map(([x, y]) => [x / 300, y / 200] as const),
      )
      // 200 dpi, arredondado para baixo.
      expect([largura, altura]).toEqual([833, 555])
      expect(
        cores.map((cor) =>
          ehBranco(cor) ? 'branco' : ehEscuro(cor) ? 'tinta' : cor.join(','),
        ),
        `página ${indice + 1}`,
      ).toEqual([
        'branco',
        'branco',
        'branco',
        'tinta',
        'tinta',
        'tinta',
        'branco',
      ])
    }
  })

  test('apagar de verdade tira também o XFA, os textos do elemento de estrutura pai e o marcador que levam ao dado da página', async ({
    page,
  }) => {
    const original = await pdfComOsDadosForaDaPagina('formulario.pdf')
    const sentinelas = [
      'XFA_CPF_999',
      'ALT_PAI_CPF',
      'T_PAI_CPF',
      'MARCADOR_CPF',
    ]
    const antes = await todoOConteudoDoPdf(original.buffer)
    for (const sentinela of sentinelas) expect(antes).toContain(sentinela)

    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, original)
    await inserirNoCentro(page, 'Cobrir')
    await page
      .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
      .click()
    await expect(page.getByTestId('editar-pdf-explicacao')).toContainText(
      'formulário XFA',
    )
    await page
      .getByRole('button', { name: 'Apagar de verdade nesta página' })
      .click()
    const { bytes } = await gerarEBaixar(page)

    const depois = await todoOConteudoDoPdf(bytes)
    expect(sentinelas.filter((s) => depois.includes(s))).toEqual([])
    expect(depois).toContain('MARCADOR_FICA')
    const [primeira, segunda] = await lerComPdfjs(bytes)
    expect(primeira.textos).toEqual([])
    expect(segunda.textos.map((t) => t.str)).toEqual(['Fica'])
  })

  // Sem tirar o XFA, o Adobe Reader mostraria a versão XFA no lugar da página, sem o que entrou por cima.
  test('híbrido só com um texto por cima: o PDF baixado sai sem o XFA e sem o /NeedsRendering, com o campo no AcroForm', async ({
    page,
  }) => {
    const original = await pdfHibrido('cadastro.pdf')
    const antes = await PDFDocument.load(original.buffer)
    expect(
      antes.catalog
        .lookup(PDFName.of('AcroForm'), PDFDict)
        .has(PDFName.of('XFA')),
    ).toBe(true)

    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, original)
    await inserirNoCentro(page, 'Texto')
    await page.keyboard.type('Aprovado')
    const { bytes } = await gerarEBaixar(page)

    const documento = await PDFDocument.load(bytes)
    expect(
      documento.catalog
        .lookup(PDFName.of('AcroForm'), PDFDict)
        .has(PDFName.of('XFA')),
    ).toBe(false)
    expect(documento.catalog.has(PDFName.of('NeedsRendering'))).toBe(false)
    expect(
      documento
        .getForm()
        .getFields()
        .map((campo) => campo.getName()),
    ).toEqual(['pessoa.nome'])
  })

  test('texto com emoji: o caractere nem entra no campo, e um alerta diz qual é e o que fazer', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300]))
    await inserirNoCentro(page, 'Texto')
    const campo = page.getByTestId('editar-pdf-campo-texto')
    await expect(campo).toBeFocused()

    await page.keyboard.type('Oi 😀')
    await expect(campo).toHaveValue('Oi ')
    await expect(campo).toBeFocused()
    const aviso = page.getByRole('alert').filter({ hasText: '😀' })
    await expect(aviso).toHaveText(
      'Este caractere não entra, porque as fontes do PDF não o escrevem: 😀. Use letras, números e sinais comuns.',
    )
    await expect(campo).toHaveAttribute(
      'aria-describedby',
      new RegExp(`${await aviso.getAttribute('id')}$`),
    )

    // O alerta sai quando a pessoa segue escrevendo, e o texto do objeto fica sem o emoji.
    await page.keyboard.type('tchau')
    await expect(campo).toHaveValue('Oi tchau')
    await expect(aviso).toHaveCount(0)
    await expect(page.getByTestId('editar-pdf-objeto')).toHaveAccessibleName(
      /^Texto 'Oi tchau', em /,
    )
  })

  test('teclado e leitor de tela: a barra e o quadro com os papéis certos, o Tab chega ao objeto, e setas e Alt+setas mudam a posição e o tamanho anunciados', async ({
    page,
  }) => {
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfDosTresFormatos('formatos.pdf'))
    await inserirNoCentro(page, 'Retângulo')
    await posicionar(page, { x: 50, y: 40 })
    await page.getByTestId('editar-pdf-objeto').focus()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      'Nenhum objeto escolhido.',
    )
    await expect(page.getByRole('application')).toBeFocused()

    await expect(page.getByTestId('editar-pdf-ferramentas'))
      .toMatchAriaSnapshot(`
      - toolbar "Ferramentas":
        - /children: equal
        - button "Selecionar e mover" [pressed]
        - button "Texto" [pressed=false]
        - button "Imagem" [pressed=false]
        - button "Desenhar" [pressed=false]
        - button "Retângulo" [pressed=false]
        - button "Elipse" [pressed=false]
        - button "Linha" [pressed=false]
        - button "Seta" [pressed=false]
        - button "Marca-texto" [pressed=false]
        - button "Cobrir" [pressed=false]
    `)
    await expect(page.getByTestId('editar-pdf-quadro')).toMatchAriaSnapshot(`
      - application "Objetos da página 1":
        - button "Retângulo, em 50 por 40, 120 por 80 pontos"
    `)
    const objeto = page.getByTestId('editar-pdf-objeto')
    await expect(objeto).toHaveAttribute(
      'aria-roledescription',
      'objeto do PDF',
    )
    await expect(objeto).toHaveAccessibleDescription(
      /^Num objeto escolhido, as setas movem 1 ponto/,
    )

    // A barra é um ponto só no Tab; daí, o Tab passa pelo Desfazer e pela área da página (que rola pelas
    // setas) e chega ao objeto, dentro do quadro.
    await page.getByRole('button', { name: 'Selecionar e mover' }).focus()
    const caminho: string[] = []
    for (
      let i = 0;
      i < 6 && !(await objeto.evaluate((o) => o === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab')
      caminho.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ??
            document.activeElement?.textContent ??
            '',
        ),
      )
    }
    expect(caminho).toEqual([
      'Desfazer',
      'Área da página 1',
      'Retângulo, em 50 por 40, 120 por 80 pontos',
    ])
    await expect(objeto).toBeFocused()

    const anuncio = page.getByTestId('editar-pdf-anuncio')
    await page.keyboard.press('ArrowRight')
    await expect(anuncio).toHaveText('Em 51 por 40, 120 por 80 pontos.')
    // O passo das setas é um passo do desfazer, e o foco continua no objeto.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(anuncio).toHaveText('Desfeito.')
    await expect(objeto).toHaveAccessibleName(
      'Retângulo, em 50 por 40, 120 por 80 pontos',
    )
    await expect(objeto).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(anuncio).toHaveText('Em 51 por 40, 120 por 80 pontos.')
    await page.keyboard.press('Shift+ArrowDown')
    await expect(anuncio).toHaveText('Em 51 por 50, 120 por 80 pontos.')
    await page.keyboard.press('Alt+ArrowRight')
    await expect(anuncio).toHaveText('Em 51 por 50, 121 por 80 pontos.')
    await page.keyboard.press('Alt+Shift+ArrowDown')
    await expect(anuncio).toHaveText('Em 51 por 50, 121 por 90 pontos.')
    await expect(objeto).toBeFocused()
    await expect(objeto).toHaveAccessibleName(
      'Retângulo, em 51 por 50, 121 por 90 pontos',
    )
    // Alt+← é voltar no navegador: com o objeto focado, fica com o objeto.
    await page.keyboard.press('Alt+ArrowLeft')
    await expect(anuncio).toHaveText('Em 51 por 50, 120 por 90 pontos.')
    await expect(page).toHaveURL('/tools/pdf/editar')
  })

  test('nada sai do aparelho no fluxo do editar: texto, imagem, desenho, marca-texto, cobrir e apagar de verdade, sem pedido de fora nem corpo com o PDF ou a imagem', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf/editar')
    const origem = new URL(page.url()).origin

    const pdf = await pdfDosTresFormatos('formatos.pdf')
    const imagem = pngDeTeste('foto.png', 64, 48)
    await abrirNoEditar(page, pdf)
    await page.getByRole('button', { name: 'Diminuir o zoom' }).click()
    await page.getByRole('button', { name: 'Diminuir o zoom' }).click()
    await expect(page.getByTestId('editar-pdf-zoom')).toHaveText('50%')
    await expect(page.getByTestId('editar-pdf-desenhando')).toHaveCount(0)
    await inserirNoCentro(page, 'Texto')
    await page.keyboard.type('Paulo Victor')
    await escolherImagem(page, imagem)
    await expect(page.getByTestId('editar-pdf-estado-imagem')).toBeVisible()
    await page.getByRole('button', { name: 'Inserir no centro' }).click()
    await page
      .getByTestId('editar-pdf-ferramentas')
      .getByRole('button', { name: 'Desenhar', exact: true })
      .click()
    await riscar(page, [
      [0.1, 0.1],
      [0.3, 0.2],
    ])
    await abrirPagina(page, 2, 3)
    await inserirNoCentro(page, 'Marca-texto')
    await inserirNoCentro(page, 'Cobrir')
    await page
      .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
      .click()
    await page
      .getByRole('button', { name: 'Apagar de verdade nesta página' })
      .click()
    await gerarEBaixar(page)

    conferirQueNadaSaiu(pedidos, origem, [pdf.buffer, imagem.buffer])
  })

  test('a 320 px, com objetos, o painel e a explicação do apagar de verdade abertos, nada rola para o lado e os controles têm 44 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(page, await pdfDosTresFormatos('formatos.pdf'))
    await inserirNoCentro(page, 'Retângulo')
    await inserirNoCentro(page, 'Cobrir')
    await page
      .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
      .click()
    await page
      .getByTestId('editar-pdf-ferramentas')
      .getByRole('button', { name: 'Cobrir', exact: true })
      .click()
    await expect(page.getByTestId('editar-pdf-explicacao')).toBeVisible()
    await expect(page.getByTestId('editar-pdf-painel')).toBeVisible()

    const largura = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(largura).toBeLessThanOrEqual(320)
    const alvos = [
      ...(await page
        .getByTestId('editar-pdf-ferramentas')
        .getByRole('button')
        .all()),
      page.getByRole('button', { name: 'Desfazer' }),
      page.getByRole('button', { name: 'Inserir no centro' }),
      page.getByTestId('editar-pdf-campo-x'),
      page.getByTestId('editar-pdf-campo-largura'),
      page.getByRole('button', { name: 'Apagar objeto' }),
      page.getByRole('button', { name: 'Apagar de verdade nesta página' }),
      page.getByTestId('editar-pdf-cancelar-apagar'),
      page.getByRole('button', { name: 'Gerar PDF editado' }),
    ]
    for (const alvo of alvos) {
      const caixa = await alvo.boundingBox()
      expect(caixa!.width).toBeGreaterThanOrEqual(44)
      expect(caixa!.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('nada sai do aparelho: abrir, passar de página e mudar o zoom sem pedido de fora nem corpo com o PDF', async ({
    page,
  }) => {
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf/editar')
    const origem = new URL(page.url()).origin

    const arquivo = await pdfComJpeg2000('a.pdf', 3)
    await abrirNoEditar(page, arquivo)
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await page.getByRole('button', { name: 'Aumentar o zoom' }).click()
    await page.getByRole('button', { name: 'Página 3', exact: true }).click()
    await expect(page.getByTestId('editar-pdf-posicao')).toHaveText(
      'Página 3 de 3',
    )
    await expect(page.getByTestId('editar-pdf-desenhando')).toHaveCount(0)

    conferirQueNadaSaiu(pedidos, origem, [arquivo.buffer])
  })

  test('a 320 px, nada rola para o lado, nem com zoom, e os controles têm 44 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf/editar')
    await abrirNoEditar(
      page,
      await pdfDeTeste(
        'relatorio-trimestral-consolidado-versao-final-revisada-2026.pdf',
        [100, 200, 300],
      ),
    )
    await page.getByRole('button', { name: 'Aumentar o zoom' }).click()
    await page.getByRole('button', { name: 'Aumentar o zoom' }).click()
    await expect(page.getByTestId('editar-pdf-zoom')).toHaveText('150%')

    const largura = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(largura).toBeLessThanOrEqual(320)
    for (const nome of [
      'Página 1',
      'Página anterior',
      'Próxima página',
      'Diminuir o zoom',
      'Aumentar o zoom',
    ]) {
      const caixa = await page
        .getByRole('button', { name: nome, exact: true })
        .boundingBox()
      expect(caixa!.width).toBeGreaterThanOrEqual(44)
      expect(caixa!.height).toBeGreaterThanOrEqual(44)
    }
  })

  for (const tema of ['light', 'dark'] as const)
    test(`todo texto do editar passa de 4,5:1 no tema ${tema}, com o painel, o cobrir, o alerta da imagem e o PDF pronto`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
      await page.goto('/tools/pdf/editar')
      await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 300]))
      await page.getByRole('button', { name: 'Próxima página' }).click()
      await expect(page.getByTestId('editar-pdf-desenhando')).toHaveCount(0)
      await inserirNoCentro(page, 'Cobrir')
      await page.getByRole('button', { name: 'Gerar PDF editado' }).click()
      await expect(page.getByTestId('editar-pdf-baixar')).toBeFocused({
        timeout: 30_000,
      })
      await page
        .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
        .click()
      await escolherImagem(page, {
        name: 'notas.png',
        mimeType: 'image/png',
        buffer: Buffer.from('não é imagem'),
      })
      await expect(page.getByTestId('editar-pdf-aviso-imagem')).toBeVisible()
      await expect(page.getByTestId('editar-pdf-painel')).toBeVisible()
      await expect(page.getByTestId('editar-pdf-explicacao')).toBeVisible()
      await expect(page.getByTestId('editar-pdf-resultado')).toBeVisible()
      // A ferramenta recém-ligada troca de cor numa transição: mede só depois de ela acabar.
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a instanceof CSSTransition)
            .map((a) => a.finished),
        ),
      )

      const medidas = await page.evaluate(
        medirContrasteDoTexto,
        '[data-testid="editar-pdf"]',
      )
      expect(medidas.length).toBeGreaterThan(30)
      expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
    })

  for (const largura of [1280, 320])
    test(`axe (WCAG 2.2 A e AA) sem violação séria a ${largura} px, com objetos, o texto escolhido, a explicação do apagar de verdade e o PDF pronto`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 800 })
      await page.goto('/tools/pdf/editar')
      await abrirNoEditar(page, await pdfDosTresFormatos('formatos.pdf'))
      await page
        .getByTestId('editar-pdf-ferramentas')
        .getByRole('button', { name: 'Desenhar', exact: true })
        .click()
      await riscar(page, [
        [0.1, 0.1],
        [0.3, 0.2],
      ])
      await inserirNoCentro(page, 'Seta')
      await inserirNoCentro(page, 'Cobrir')
      await inserirNoCentro(page, 'Texto')
      await page.keyboard.type('Paulo Victor')
      await page.getByRole('button', { name: 'Gerar PDF editado' }).click()
      await expect(page.getByTestId('editar-pdf-baixar')).toBeFocused({
        timeout: 30_000,
      })
      await page
        .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
        .click()
      await expect(page.getByTestId('editar-pdf-campo-texto')).toHaveValue(
        'Paulo Victor',
      )
      await expect(page.getByTestId('editar-pdf-explicacao')).toBeVisible()
      await expect(page.getByTestId('editar-pdf-resultado')).toBeVisible()

      expect(await violacoesDoAxe(page, '[data-testid="editar-pdf"]')).toEqual(
        [],
      )
    })
})
