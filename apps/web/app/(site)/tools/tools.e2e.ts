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
  PDFNumber,
  type PDFPage,
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

// ---- Editor único, PR 6: a rota única ----

// P5 (decidida pelo Paulo em 2026-11-18): quem tinha o link de um modo antigo, ou do Assinar, cai no editor.
const ROTAS_ANTIGAS = [
  '/tools/pdf/assinar',
  '/tools/pdf/mesclar',
  '/tools/pdf/organizar',
  '/tools/pdf/editar',
  '/tools/mesclar-pdf',
]

// Uma mensagem do pdf.js que a minificação não toca: só o chunk dele a tem.
const MARCA_DO_PDFJS = 'Setting up fake worker failed'

test.describe('Editor de PDF: a rota única', () => {
  for (const rota of ROTAS_ANTIGAS)
    test(`${rota} responde 308 para /tools/pdf, e seguindo abre o editor num salto só`, async ({
      page,
    }) => {
      const direto = await page.request.get(rota, { maxRedirects: 0 })
      expect(direto.status()).toBe(308)
      expect(direto.headers()['location']).toBe('/tools/pdf')

      const resposta = await page.goto(rota)
      expect(resposta!.status()).toBe(200)
      await expect(page).toHaveURL('/tools/pdf')
      const saltos: string[] = []
      for (
        let pedido = resposta!.request().redirectedFrom();
        pedido;
        pedido = pedido.redirectedFrom()
      ) {
        saltos.push(new URL(pedido.url()).pathname)
      }
      expect(saltos).toEqual([rota])
      await expect(
        page.getByRole('heading', { level: 1, name: 'Editor de PDF' }),
      ).toBeVisible()
      await expect(page.getByTestId('pdf-zona')).toBeVisible()
    })

  test('/tools tem um cartão só para PDF, o do Editor de PDF, e ele abre o editor em /tools/pdf', async ({
    page,
  }) => {
    await page.goto('/tools')
    const cartoes = page.locator('a[href^="/tools/pdf"]')
    await expect(cartoes).toHaveCount(1)
    await expect(cartoes).toHaveAttribute('href', '/tools/pdf')
    await expect(cartoes).toContainText('Editor de PDF')
    await expect(page.locator('a[href="/tools/mesclar-pdf"]')).toHaveCount(0)

    await cartoes.click()
    await expect(page).toHaveURL('/tools/pdf')
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
  })

  test('/tools/pdf sem arquivo: o editor com o aviso de privacidade, sem nenhum Worker e sem o pdf.js, que só chega com o PDF', async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    const pedidosAoPdfjsDaOrigem: string[] = []
    const scripts: { url: string; corpo: Promise<string> }[] = []
    page.on('request', (pedido) => {
      if (new URL(pedido.url()).pathname.startsWith('/pdfjs/')) {
        pedidosAoPdfjsDaOrigem.push(pedido.url())
      }
    })
    page.on('response', (resposta) => {
      if (resposta.request().resourceType() === 'script') {
        scripts.push({
          url: resposta.url(),
          corpo: resposta.text().catch(() => ''),
        })
      }
    })
    const scriptsComOPdfjs = async () =>
      (
        await Promise.all(
          scripts.map(async ({ url, corpo }) =>
            (await corpo).includes(MARCA_DO_PDFJS) ? [url] : [],
          ),
        )
      ).flat()

    await page.goto('/tools/pdf')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Editor de PDF' }),
    ).toBeVisible()
    await expect(
      page.getByText('Seus arquivos não saem do aparelho'),
    ).toBeVisible()
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
    // Contra piluvitu.com.br o networkidle não chega, nem sem pedido aberto: espera a página parar de baixar.
    let recursos = -1
    await expect
      .poll(
        async () => {
          const agora = await page.evaluate(
            () => performance.getEntriesByType('resource').length,
          )
          const parou = agora === recursos
          recursos = agora
          return parou
        },
        { intervals: [1000] },
      )
      .toBe(true)
    expect(workers).toEqual([])
    expect(await scriptsComOPdfjs()).toEqual([])
    expect(pedidosAoPdfjsDaOrigem).toEqual([])

    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [100, 200]))
    expect(workers).toHaveLength(2)
    // A sonda acha o pdf.js quando ele chega: o vazio de antes vale.
    expect(await scriptsComOPdfjs()).not.toEqual([])
  })

  test('PDF protegido e arquivo que não é PDF: o erro escrito num alerta, nenhuma página aberta, e o pdf.js nem nasce', async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await page.goto('/tools/pdf')
    const erro = page.getByTestId('editar-pdf-erro')

    await escolherPdfs(page, [await pdfProtegido('com-senha.pdf')])
    await expect(erro).toHaveText(
      /^Não deu para abrir com-senha\.pdf\. Está protegido por senha/,
    )
    await expect(erro).toHaveAttribute('role', 'alert')
    await expect(page.getByTestId('editar-pdf-canvas')).toHaveCount(0)
    expect(workers).toHaveLength(1)

    await escolherPdfs(page, [
      { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') },
    ])
    await expect(erro).toHaveText(
      'Não deu para abrir notas.txt. Não é um PDF. Escolha um arquivo .pdf.',
    )
    await expect(page.getByTestId('editar-pdf-canvas')).toHaveCount(0)
    expect(workers).toHaveLength(1)
  })

  test('a 320 px, sem arquivo e com o erro de um nome comprido, nada rola para o lado e o Escolher tem 44 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf')
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
    const larguraDaPagina = () =>
      page.evaluate(() => document.documentElement.scrollWidth)
    expect(await larguraDaPagina()).toBeLessThanOrEqual(320)

    await escolherPdfs(page, [
      await pdfProtegido(
        'relatorio-trimestral-consolidado-versao-final-revisada-2026.pdf',
      ),
    ])
    await expect(page.getByTestId('editar-pdf-erro')).toBeVisible()
    expect(await larguraDaPagina()).toBeLessThanOrEqual(320)
    const caixa = (await page.getByTestId('pdf-escolher').boundingBox())!
    expect(caixa.width).toBeGreaterThanOrEqual(44)
    expect(caixa.height).toBeGreaterThanOrEqual(44)
  })

  for (const tema of ['light', 'dark'] as const)
    test(`todo texto de /tools/pdf passa de 4,5:1 no tema ${tema}, sem arquivo e com o erro de abertura`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
      await page.goto('/tools/pdf')
      await expect(page.getByTestId('pdf-zona')).toBeVisible()

      const semArquivo = await page.evaluate(medirContrasteDoTexto, 'main')
      expect(semArquivo.length).toBeGreaterThan(6)
      expect(semArquivo.filter((m) => m.razao < 4.5)).toEqual([])

      await escolherPdfs(page, [await pdfProtegido('com-senha.pdf')])
      await expect(page.getByTestId('editar-pdf-erro')).toBeVisible()
      const comErro = await page.evaluate(medirContrasteDoTexto, 'main')
      expect(
        comErro.some((m) => m.texto.startsWith('Não deu para abrir')),
      ).toBe(true)
      expect(comErro.filter((m) => m.razao < 4.5)).toEqual([])
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

// Na Bancada larga, pelo cartão da coluna; no celular, pela faixa numerada.
async function abrirPagina(page: Page, numero: number, total: number) {
  const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
  await (
    (await coluna.isVisible())
      ? coluna.getByRole('button', { name: `Abrir a página ${numero}` })
      : page.getByRole('button', { name: `Página ${numero}`, exact: true })
  ).click()
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
  await page.getByRole('button', { name: 'Gerar PDF', exact: true }).click()
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

// O /AcroForm e o /Perms montados à mão, e o save sem as aparências: o getForm() do pdf-lib tiraria o /XFA.
async function pdfComAvisos(
  nome: string,
  { assinado = false, certificado = false, xfa = false },
) {
  const documento = await PDFDocument.create()
  const { context } = documento
  documento.addPage([400, 500])
  const assinatura = () =>
    context.register(
      context.obj({
        Type: 'Sig',
        Filter: 'Adobe.PPKLite',
        SubFilter: 'adbe.pkcs7.detached',
      }),
    )
  if (assinado || xfa) {
    documento.catalog.set(
      PDFName.of('AcroForm'),
      context.obj({
        Fields: assinado
          ? [
              context.register(
                context.obj({
                  FT: 'Sig',
                  T: PDFString.of('assinatura'),
                  V: assinatura(),
                }),
              ),
            ]
          : [],
        ...(xfa ? { XFA: xfaDe(documento) } : {}),
      }),
    )
  }
  if (certificado) {
    documento.catalog.set(
      PDFName.of('Perms'),
      context.obj({ DocMDP: assinatura(), UR3: assinatura() }),
    )
  }
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      await documento.save({ updateFieldAppearances: false }),
    ),
  }
}

const AVISO_DA_ASSINATURA =
  'Este PDF tem assinatura digital. Editar invalida a assinatura.'
const AVISO_DO_XFA =
  'Este PDF é um formulário XFA: o que você escrever por cima pode não aparecer no Adobe Acrobat e no Reader.'

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
    await page.goto('/tools/pdf')
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
    // A miniatura só é desenhada perto da tela; com o Adicionar PDF na coluna (PR 4), o cartão passou da margem.
    await page.getByTestId('editar-pdf-pagina').first().scrollIntoViewIfNeeded()
    const miniatura = page.getByTestId('editar-pdf-cartao-miniatura').first()
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
    await page.goto('/tools/pdf')
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
    await page.goto('/tools/pdf')
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
    await page.goto('/tools/pdf')
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
    await page.goto('/tools/pdf')
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
    await page.goto('/tools/pdf')
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
    await page.goto('/tools/pdf')
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

    await page.goto('/tools/pdf')
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

    await page.goto('/tools/pdf')
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

    await page.goto('/tools/pdf')
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

  for (const [caso, gerar, avisos] of [
    [
      'assinado',
      () => pdfComAvisos('arquivo.pdf', { assinado: true }),
      [AVISO_DA_ASSINATURA],
    ],
    [
      'certificado',
      () => pdfComAvisos('arquivo.pdf', { certificado: true }),
      [AVISO_DA_ASSINATURA],
    ],
    [
      'XFA puro',
      () => pdfComAvisos('arquivo.pdf', { xfa: true }),
      [AVISO_DO_XFA],
    ],
    [
      'certificado e XFA puro',
      () => pdfComAvisos('arquivo.pdf', { certificado: true, xfa: true }),
      [AVISO_DA_ASSINATURA, AVISO_DO_XFA],
    ],
    [
      'assinado com XFA ao lado do campo (híbrido)',
      () => pdfComAvisos('arquivo.pdf', { assinado: true, xfa: true }),
      [AVISO_DA_ASSINATURA],
    ],
    ['comum', () => pdfComAvisos('arquivo.pdf', {}), []],
    ['híbrido', () => pdfHibrido('arquivo.pdf'), []],
  ] as const)
    test(`avisos ao abrir, ${caso}: ${avisos.length} na tela e no anúncio do aberto`, async ({
      page,
    }) => {
      await page.goto('/tools/pdf')
      await abrirNoEditar(page, await gerar())

      await expect(page.getByTestId('editar-pdf-aviso')).toHaveCount(
        avisos.length,
      )
      for (const [i, aviso] of avisos.entries()) {
        await expect(page.getByTestId('editar-pdf-aviso').nth(i)).toHaveText(
          aviso,
        )
      }
      await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
        [`arquivo.pdf · 1 página${avisos.length ? '.' : ''}`, ...avisos].join(
          ' ',
        ),
      )
    })

  test('os avisos não bloqueiam: o certificado com XFA puro gera o PDF com o texto, e o XFA fica como antes', async ({
    page,
  }) => {
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfComAvisos('requerimento.pdf', {
        certificado: true,
        xfa: true,
      }),
    )
    await expect(page.getByTestId('editar-pdf-aviso')).toHaveCount(2)
    await inserirNoCentro(page, 'Texto')
    await page.keyboard.type('Ciente')
    const { nome, bytes } = await gerarEBaixar(page)

    expect(nome).toBe('requerimento-editado.pdf')
    const documento = await PDFDocument.load(bytes)
    expect(documento.getPageCount()).toBe(1)
    expect(
      documento.catalog
        .lookup(PDFName.of('AcroForm'), PDFDict)
        .has(PDFName.of('XFA')),
    ).toBe(true)
  })

  test('a 320 px, com os dois avisos e um nome comprido, nada rola para o lado, e o axe não acha violação séria', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfComAvisos(
        'requerimento-de-certidao-assinado-pelo-cartorio-de-registro-civil-2026.pdf',
        { certificado: true, xfa: true },
      ),
    )
    await expect(page.getByTestId('editar-pdf-aviso')).toHaveCount(2)

    const largura = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(largura).toBeLessThanOrEqual(320)
    for (const aviso of await page.getByTestId('editar-pdf-aviso').all()) {
      const caixa = (await aviso.boundingBox())!
      expect(caixa.x).toBeGreaterThanOrEqual(0)
      expect(caixa.x + caixa.width).toBeLessThanOrEqual(320)
    }
    expect(await violacoesDoAxe(page, '[data-testid="editar-pdf"]')).toEqual([])
  })

  for (const tema of ['light', 'dark'] as const)
    test(`os avisos passam de 4,5:1 no tema ${tema}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
      await page.goto('/tools/pdf')
      await abrirNoEditar(
        page,
        await pdfComAvisos('b.pdf', { certificado: true, xfa: true }),
      )
      await expect(page.getByTestId('editar-pdf-aviso')).toHaveCount(2)

      const medidas = await page.evaluate(
        medirContrasteDoTexto,
        '[data-testid="editar-pdf-avisos"]',
      )
      expect(medidas.map((m) => m.texto)).toEqual([
        AVISO_DA_ASSINATURA.slice(0, 30),
        AVISO_DO_XFA.slice(0, 30),
      ])
      expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
    })

  test('texto com emoji: o caractere nem entra no campo, e um alerta diz qual é e o que fazer', async ({
    page,
  }) => {
    await page.goto('/tools/pdf')
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
    await page.goto('/tools/pdf')
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
    await expect(page).toHaveURL('/tools/pdf')
  })

  test('nada sai do aparelho no fluxo do editar: texto, imagem, desenho, marca-texto, cobrir e apagar de verdade, sem pedido de fora nem corpo com o PDF ou a imagem', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf')
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
    await page.goto('/tools/pdf')
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
      page.getByRole('button', { name: 'Gerar PDF', exact: true }),
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
    await page.goto('/tools/pdf')
    const origem = new URL(page.url()).origin

    const arquivo = await pdfComJpeg2000('a.pdf', 3)
    await abrirNoEditar(page, arquivo)
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await page.getByRole('button', { name: 'Aumentar o zoom' }).click()
    await abrirPagina(page, 3, 3)
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
    await page.goto('/tools/pdf')
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
      await page.goto('/tools/pdf')
      await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 300]))
      await page.getByRole('button', { name: 'Próxima página' }).click()
      await expect(page.getByTestId('editar-pdf-desenhando')).toHaveCount(0)
      await inserirNoCentro(page, 'Cobrir')
      await page.getByRole('button', { name: 'Gerar PDF', exact: true }).click()
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
      await page.goto('/tools/pdf')
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
      // O axe roda sem a sobreposição de propósito: a seta desce para fora do cobrir antes dele. Objetos
      // postos um sobre o outro são aceitos pela exceção "essencial" do 2.5.8 (a posição é a que a pessoa
      // escolheu; cada objeto tem 24 px de alvo e o Tab chega a todos), e aqui o axe confere o editor.
      for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowDown')
      await inserirNoCentro(page, 'Cobrir')
      await inserirNoCentro(page, 'Texto')
      await page.keyboard.type('Paulo Victor')
      await page.getByRole('button', { name: 'Gerar PDF', exact: true }).click()
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

// Paradas de Tab a partir do foco de agora até o elemento com o data-testid pedido.
async function tabsAte(page: Page, alvo: string, limite: number) {
  for (let paradas = 1; paradas <= limite; paradas++) {
    await page.keyboard.press('Tab')
    const focado = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    )
    if (focado === alvo) return paradas
  }
  throw new Error(`${alvo} não chegou em ${limite} paradas de Tab`)
}

async function escreverTexto(
  page: Page,
  conteudo: string,
  caixa: { x: number; y: number },
) {
  await inserirNoCentro(page, 'Texto')
  await expect(page.getByTestId('editar-pdf-campo-texto')).toBeFocused()
  await page.keyboard.type(conteudo)
  await posicionar(page, caixa)
  const linha = page.locator(
    '[data-testid="editar-pdf-desenho"][data-tipo="texto"] text',
  )
  await expect(linha).toHaveText(conteudo)
  return {
    x: Number(await linha.getAttribute('x')),
    y: Number(await linha.getAttribute('y')),
  }
}

test.describe('Editar PDF: a Bancada', () => {
  test('num PDF de três páginas: girar depois de escrever, escrever numa girada, apagar e mover; no PDF baixado, a ordem, o /Rotate e o texto onde a tela mostrou, sem nada sair do aparelho', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf')
    const origem = new URL(page.url()).origin
    // Quadradas e de lados diferentes: o lado diz de onde a página veio, e girar não muda o tamanho.
    const arquivo = await pdfDeTeste('bancada.pdf', [300, 320, 340])
    await abrirNoEditar(page, arquivo)
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')

    const antes = await escreverTexto(page, 'Antes', { x: 40, y: 60 })
    await coluna
      .getByRole('button', { name: 'Girar a página 1 à direita' })
      .click()
    // A página grande fica como estava, com a nota; os objetos giram junto no PDF.
    await expect(page.getByTestId('editar-pdf-nota-do-giro')).toHaveText(
      'No PDF, esta página sai girada 90° à direita, com os objetos.',
    )

    await coluna
      .getByRole('button', { name: 'Girar a página 3 à direita' })
      .click()
    await abrirPagina(page, 3, 3)
    await expect(page.getByTestId('editar-pdf-nota-do-giro')).toHaveCount(0)
    const depois = await escreverTexto(page, 'Depois', { x: 50, y: 80 })

    await coluna.getByRole('button', { name: 'Apagar a página 2' }).click()
    await coluna.getByRole('checkbox', { name: 'Selecionar página 2' }).check()
    await coluna.getByRole('button', { name: 'Mover para antes' }).click()
    await expect(coluna.getByTestId('editar-pdf-pagina')).toHaveCount(2)
    await expect(coluna.getByTestId('editar-pdf-pagina').first()).toContainText(
      'bancada.pdf, pág. 3',
    )

    const { nome, bytes } = await gerarEBaixar(page)
    expect(nome).toBe('bancada-editado.pdf')
    const final = await PDFDocument.load(bytes)
    expect(
      final.getPages().map((p) => [p.getSize().width, p.getRotation().angle]),
    ).toEqual([
      [340, 90],
      [300, 90],
    ])
    const lidas = await lerComPdfjs(bytes)
    const lidoDepois = lidas[0].textos.find((t) => t.str === 'Depois')
    const lidoAntes = lidas[1].textos.find((t) => t.str === 'Antes')
    expect(lidoDepois).toBeDefined()
    expect(lidoAntes).toBeDefined()
    // Escrito na página já girada: de pé, onde a tela mostrou.
    conferirCaixa(lidoDepois!.matriz, [16, 0, 0, -16, depois.x, depois.y], 0.05)
    // Escrito antes de girar: gira com a página (90° à direita numa página de 300 de lado).
    conferirCaixa(
      lidoAntes!.matriz,
      [0, 16, 16, 0, 300 - antes.y, antes.x],
      0.05,
    )
    conferirQueNadaSaiu(pedidos, origem, [arquivo.buffer])
  })

  test('extrair a página com apagar de verdade: o PDF extraído não tem o texto coberto, e nada sai do aparelho', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf')
    const origem = new URL(page.url()).origin
    const original = await pdfDosTresFormatos('formatos.pdf')
    await abrirNoEditar(page, original)

    await abrirPagina(page, 2, 3)
    await inserirNoCentro(page, 'Cobrir')
    await posicionar(page, { x: 32, y: 40, largura: 200, altura: 30 })
    await page
      .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
      .click()
    await page
      .getByRole('button', { name: 'Apagar de verdade nesta página' })
      .click()
    await expect(page.getByTestId('editar-pdf-apagar-ligado')).toBeVisible()

    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    await coluna.getByRole('checkbox', { name: 'Selecionar página 2' }).check()
    await coluna
      .getByRole('button', { name: 'Extrair as selecionadas' })
      .click()
    const baixar = page.getByTestId('editar-pdf-baixar')
    await expect(baixar).toBeFocused({ timeout: 30_000 })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      baixar.click(),
    ])
    expect(download.suggestedFilename()).toBe('formatos-paginas.pdf')
    const bytes = new Uint8Array(readFileSync((await download.path())!))
    const lidas = await lerComPdfjs(bytes)
    expect(lidas).toHaveLength(1)
    expect(lidas[0].textos).toEqual([])
    expect(await todoOConteudoDoPdf(bytes)).not.toContain('123.456.789')
    conferirQueNadaSaiu(pedidos, origem, [original.buffer])
  })

  for (const total of [7, 500])
    test(`M4: paradas de Tab até a página aberta com ${total} páginas, sem e com o link de pular`, async ({
      page,
    }) => {
      test.setTimeout(300_000)
      await page.goto('/tools/pdf')
      await abrirNoEditar(
        page,
        await pdfDeTeste(
          `paginas-${total}.pdf`,
          Array.from({ length: total }, () => 100),
        ),
      )
      const limite = total * 4 + 50

      await page.getByTestId('pdf-escolher').focus()
      const semOLink = await tabsAte(page, 'editar-pdf-area', limite)

      await page.getByTestId('pdf-escolher').focus()
      const ateOLink = await tabsAte(page, 'editar-pdf-pular', limite)
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('editar-pdf-area')).toBeFocused()

      console.log(
        `M4 ${total} páginas: ${semOLink} paradas de Tab sem o link; ${ateOLink} até o link e Enter com ele`,
      )
      test.info().annotations.push({
        type: 'M4',
        description: `${total} páginas: sem o link ${semOLink}, com o link ${ateOLink} + Enter`,
      })
      expect(semOLink).toBeGreaterThanOrEqual(total * 4)
      // O "Adicionar PDF" (PR 4) e o "Página em branco" (PR 5) ficam antes da barra.
      expect(ateOLink).toBeLessThanOrEqual(4)
    })

  test('a 320 px, a folha Páginas abre pela borda de baixo, prende o foco, fecha no Esc com o foco de volta no botão, e abrir uma página por ela leva à página', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfDeTeste(
        'relatorio-trimestral-consolidado-versao-final-revisada-2026.pdf',
        [100, 200, 300],
      ),
    )
    await expect(page.getByTestId('editar-pdf-coluna-de-paginas')).toHaveCount(
      0,
    )
    // Ferramentas embaixo da página, no fluxo.
    const posicaoDe = async (testId: string) =>
      (await page.getByTestId(testId).boundingBox())!.y
    expect(await posicaoDe('editar-pdf-ferramentas')).toBeGreaterThan(
      await posicaoDe('editar-pdf-area'),
    )

    const botao = page.getByRole('button', { name: 'Páginas', exact: true })
    await botao.click()
    const folha = page.getByRole('dialog', { name: 'Páginas' })
    await expect(folha).toBeVisible()
    await expect(folha.getByTestId('editar-pdf-pagina')).toHaveCount(3)
    await folha.getByRole('checkbox', { name: 'Selecionar página 2' }).check()
    // A 720 px de altura a seleção começa recolhida; aberta, os botões dela também entram na conta dos 44 px.
    const daSelecao = folha.getByRole('button', { name: /^Na seleção/ })
    await expect(daSelecao).toHaveAttribute('aria-expanded', 'false')
    await daSelecao.click()
    await expect(daSelecao).toHaveAttribute('aria-expanded', 'true')
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished)),
    )
    const caixaDaFolha = (await folha.boundingBox())!
    expect(caixaDaFolha.x).toBeGreaterThanOrEqual(0)
    expect(caixaDaFolha.x + caixaDaFolha.width).toBeLessThanOrEqual(320)
    expect(Math.round(caixaDaFolha.y + caixaDaFolha.height)).toBe(720)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320)
    expect(await folha.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    const daBarra = await folha
      .getByTestId('editar-pdf-barra')
      .getByRole('button')
      .all()
    expect(daBarra.length).toBeGreaterThan(0)
    const alvos = [
      folha.getByTestId('editar-pdf-selecao').first(),
      folha.getByRole('button', { name: 'Abrir a página 1' }),
      folha.getByRole('button', { name: 'Girar a página 1 à direita' }),
      folha.getByRole('button', { name: 'Apagar a página 1' }),
      daSelecao,
      ...daBarra,
      folha.getByRole('button', { name: 'Fechar' }),
    ]
    for (const alvo of alvos) {
      const caixa = (await alvo.boundingBox())!
      expect(caixa.width).toBeGreaterThanOrEqual(44)
      expect(caixa.height).toBeGreaterThanOrEqual(44)
    }

    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      expect(
        await folha.evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(folha).toHaveCount(0)
    await expect(botao).toBeFocused()

    await botao.click()
    await page
      .getByRole('dialog', { name: 'Páginas' })
      .getByRole('button', { name: 'Abrir a página 3' })
      .click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('editar-pdf-posicao')).toHaveText(
      'Página 3 de 3',
    )
    await expect(page.getByTestId('editar-pdf-area')).toBeFocused()
  })

  for (const largura of [1024, 1280])
    test(`a ${largura} px, cada controle do cartão e da barra na coluna Páginas tem 44 px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 800 })
      await page.goto('/tools/pdf')
      await abrirNoEditar(
        page,
        await pdfDeTeste('contrato-de-prestacao.pdf', [100, 200, 300]),
      )
      const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
      await coluna
        .getByRole('checkbox', { name: 'Selecionar página 2' })
        .check()
      const alvos = [
        coluna.getByTestId('editar-pdf-selecao').first(),
        coluna.getByRole('button', { name: 'Abrir a página 1' }),
        coluna.getByRole('button', { name: 'Girar a página 1 à direita' }),
        coluna.getByRole('button', { name: 'Apagar a página 1' }),
        ...(await coluna
          .getByTestId('editar-pdf-barra')
          .getByRole('button')
          .all()),
      ]
      for (const alvo of alvos) {
        const caixa = (await alvo.boundingBox())!
        expect(caixa.width).toBeGreaterThanOrEqual(44)
        expect(caixa.height).toBeGreaterThanOrEqual(44)
      }
      expect(
        await coluna.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    })

  for (const [largura, altura, recolhida] of [
    [390, 844, false],
    [320, 720, true],
  ] as const)
    test(`a ${largura} × ${altura} px, com 20 páginas, a lista rola dentro da folha: o título, o Fechar e as ações da seleção ficam à vista (a seleção ${recolhida ? 'aberta pelo botão' : 'já aberta'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: altura })
      await page.goto('/tools/pdf')
      await abrirNoEditar(
        page,
        await pdfDeTeste(
          'vinte.pdf',
          Array.from({ length: 20 }, () => 100),
        ),
      )
      await page.getByRole('button', { name: 'Páginas', exact: true }).click()
      const folha = page.getByRole('dialog', { name: 'Páginas' })
      await expect(folha).toBeVisible()
      const daSelecao = folha.getByRole('button', { name: /^Na seleção/ })
      await expect(daSelecao).toHaveAttribute(
        'aria-expanded',
        String(!recolhida),
      )
      if (recolhida) await daSelecao.click()
      await folha
        .getByRole('checkbox', { name: 'Selecionar página 12' })
        .check()
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished)),
      )

      const daFolha = (await folha.boundingBox())!
      for (const alvo of [
        folha.getByRole('heading', { name: 'Páginas' }),
        folha.getByRole('button', { name: 'Fechar' }),
        folha.getByRole('button', { name: 'Extrair as selecionadas' }),
        folha.getByRole('button', { name: 'Apagar', exact: true }),
        folha.getByRole('checkbox', { name: 'Selecionar página 12' }),
      ]) {
        const caixa = (await alvo.boundingBox())!
        expect(caixa.y).toBeGreaterThanOrEqual(daFolha.y)
        expect(caixa.y + caixa.height).toBeLessThanOrEqual(
          daFolha.y + daFolha.height,
        )
      }
      expect(
        await folha
          .getByTestId('editar-pdf-rolagem-da-folha')
          .evaluate((el) => el.scrollTop),
      ).toBeGreaterThan(0)
    })

  for (const largura of [1280, 320])
    test(`axe (WCAG 2.2 A e AA) sem violação séria na Bancada a ${largura} px, com página selecionada e girada${largura === 320 ? ' e a folha aberta' : ''}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 800 })
      await page.goto('/tools/pdf')
      await abrirNoEditar(page, await pdfDeTeste('a.pdf', [100, 200, 300]))
      await inserirNoCentro(page, 'Retângulo')
      if (largura === 320) {
        await page.getByRole('button', { name: 'Páginas', exact: true }).click()
      }
      const lista =
        largura === 320
          ? page.getByRole('dialog', { name: 'Páginas' })
          : page.getByTestId('editar-pdf-coluna-de-paginas')
      await lista
        .getByRole('button', { name: 'Girar a página 1 à direita' })
        .click()
      await lista.getByRole('checkbox', { name: 'Selecionar página 2' }).check()
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished)),
      )

      expect(
        await violacoesDoAxe(
          page,
          largura === 320 ? '[role="dialog"]' : '[data-testid="editar-pdf"]',
        ),
      ).toEqual([])
    })

  for (const tema of ['light', 'dark'] as const)
    for (const largura of [1280, 320])
      test(`as páginas da Bancada passam de 4,5:1 no tema ${tema} a ${largura} px (${largura === 320 ? 'a folha' : 'a coluna'}, com a página aberta, a selecionada, a girada e a nota)`, async ({
        page,
      }) => {
        await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
        await page.setViewportSize({ width: largura, height: 800 })
        await page.goto('/tools/pdf')
        await abrirNoEditar(page, await pdfDeTeste('a.pdf', [100, 200, 300]))
        await inserirNoCentro(page, 'Retângulo')
        if (largura === 320) {
          await page
            .getByRole('button', { name: 'Páginas', exact: true })
            .click()
        }
        const lista =
          largura === 320
            ? page.getByRole('dialog', { name: 'Páginas' })
            : page.getByTestId('editar-pdf-coluna-de-paginas')
        await lista
          .getByRole('button', { name: 'Girar a página 1 à direita' })
          .click()
        await lista
          .getByRole('checkbox', { name: 'Selecionar página 2' })
          .check()
        await page.evaluate(() =>
          Promise.all(document.getAnimations().map((a) => a.finished)),
        )

        const seletor =
          largura === 320
            ? '[role="dialog"]'
            : '[data-testid="editar-pdf-coluna-de-paginas"]'
        const medidas = await page.evaluate(medirContrasteDoTexto, seletor)
        expect(medidas.length).toBeGreaterThan(8)
        expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
        if (largura === 320) {
          await page.keyboard.press('Escape')
        }
        const nota = await page.evaluate(
          medirContrasteDoTexto,
          '[data-testid="editar-pdf-edicao"]',
        )
        expect(
          nota.some((m) => m.texto.startsWith('No PDF, esta página')),
        ).toBe(true)
        expect(nota.filter((m) => m.razao < 4.5)).toEqual([])
      })

  test('pelo teclado: gira a página 2, apaga a 3 e leva a 1 para o fim, com o anúncio e o foco a cada passo; no PDF baixado, a ordem e o /Rotate', async ({
    page,
  }) => {
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfDeTeste('contrato.pdf', [100, 200, 300, 400]),
    )
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    const anuncio = page.getByTestId('editar-pdf-anuncio')

    await coluna
      .getByRole('button', { name: 'Girar a página 2 à direita' })
      .focus()
    await page.keyboard.press('Enter')
    await expect(anuncio).toHaveText(/^Página 2 girada para 90°\./)
    await coluna.getByRole('button', { name: 'Apagar a página 3' }).focus()
    await page.keyboard.press('Enter')
    await expect(anuncio).toHaveText(/^Página 3 apagada\./)
    await expect(
      coluna.getByRole('checkbox', { name: 'Selecionar página 3' }),
    ).toBeFocused()

    await coluna.getByRole('checkbox', { name: 'Selecionar página 1' }).focus()
    await page.keyboard.press('Space')
    const depois = coluna.getByRole('button', { name: 'Mover para depois' })
    await depois.focus()
    await page.keyboard.press('Enter')
    await expect(depois).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(coluna.getByTestId('editar-pdf-pagina')).toContainText([
      'contrato.pdf, pág. 2',
      'contrato.pdf, pág. 4',
      'contrato.pdf, pág. 1',
    ])
    await expect(
      coluna.getByRole('button', { name: 'Mover para antes' }),
    ).toBeFocused()

    const { nome, bytes } = await gerarEBaixar(page)
    expect(nome).toBe('contrato-editado.pdf')
    const final = await PDFDocument.load(bytes)
    expect(final.getPages().map((p) => p.getWidth())).toEqual([200, 400, 100])
    expect(final.getPages().map((p) => p.getRotation().angle)).toEqual([
      90, 0, 0,
    ])
  })

  test('Ctrl+Z com o foco nas páginas volta a página apagada', async ({
    page,
  }) => {
    await page.goto('/tools/pdf')
    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [100, 200, 300]))
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    const cartoes = coluna.getByTestId('editar-pdf-pagina')

    await coluna.getByRole('button', { name: 'Apagar a página 2' }).click()
    await expect(cartoes).toHaveCount(2)
    await page.keyboard.press('ControlOrMeta+z')

    await expect(cartoes).toContainText([
      'a.pdf, pág. 1',
      'a.pdf, pág. 2',
      'a.pdf, pág. 3',
    ])
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      'Desfeito nas páginas.',
    )
  })

  test('extrai as selecionadas, giradas pela barra, num PDF novo com o nome -paginas, e o documento fica com todas', async ({
    page,
  }) => {
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfDeTeste('relatorio.pdf', [100, 200, 300]),
    )
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')

    await coluna.getByRole('checkbox', { name: 'Selecionar página 3' }).check()
    await coluna.getByRole('checkbox', { name: 'Selecionar página 1' }).check()
    await coluna.getByRole('button', { name: 'Girar à esquerda' }).click()
    await coluna
      .getByRole('button', { name: 'Extrair as selecionadas' })
      .click()

    const baixar = page.getByTestId('editar-pdf-baixar')
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
    await expect(coluna.getByTestId('editar-pdf-pagina')).toHaveCount(3)
  })

  test('as miniaturas aparecem, desenhadas pelo pdf.js de verdade, e giram com a página', async ({
    page,
  }) => {
    await page.goto('/tools/pdf')
    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [100, 200]))
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    // A miniatura só é desenhada perto da tela, e o Adicionar PDF empurra os cartões para baixo.
    await coluna
      .getByTestId('editar-pdf-pagina')
      .last()
      .scrollIntoViewIfNeeded()

    const miniaturas = coluna.getByTestId('editar-pdf-cartao-miniatura')
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

    await coluna
      .getByRole('button', { name: 'Girar a página 1 à direita' })
      .click()
    await expect(miniaturas.first()).toHaveAttribute('style', /rotate\(90deg\)/)
  })

  // Menor 4 do Crivo no #129: altura de celular pequeno (e a de 200% de zoom), onde a folha mal cabe.
  async function abrirAFolhaCom20(page: Page) {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfDeTeste(
        'vinte.pdf',
        Array.from({ length: 20 }, () => 100),
      ),
    )
    await page.getByRole('button', { name: 'Páginas', exact: true }).click()
    const folha = page.getByRole('dialog', { name: 'Páginas' })
    await expect(folha).toBeVisible()
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished)),
    )
    return folha
  }

  test('a 320 × 568 px, com 20 páginas, a folha Páginas cabe na tela, nada rola para o lado, e a lista guarda os 80 px dela e rola até a marcada', async ({
    page,
  }) => {
    const folha = await abrirAFolhaCom20(page)
    await expect(folha.getByTestId('editar-pdf-pagina')).toHaveCount(20)
    const daFolha = (await folha.boundingBox())!
    expect(daFolha.y).toBeGreaterThanOrEqual(0)
    expect(Math.round(daFolha.y + daFolha.height)).toBe(568)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320)
    expect(await folha.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    const rolagem = folha.getByTestId('editar-pdf-rolagem-da-folha')
    expect((await rolagem.boundingBox())!.height).toBeGreaterThanOrEqual(80)

    const marcada = folha.getByRole('checkbox', {
      name: 'Selecionar página 12',
    })
    await marcada.check()
    await expect(marcada).toBeInViewport()
    expect(await rolagem.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  })

  // Achado do E2E pedido pelo Crivo no #129: a 568 px de altura, com a barra da seleção e as dicas abertas, a
  // lista começava abaixo da borda da tela e a própria folha rolava. Decisão do Paulo (2026-11-18): em tela
  // baixa, a seleção começa recolhida num bloco que abre pelo botão "Na seleção".
  test('a 320 × 568 px, ao abrir a folha Páginas, a seleção vem recolhida, a lista já aparece com uma página inteira, e só ela rola', async ({
    page,
  }) => {
    const folha = await abrirAFolhaCom20(page)
    const daSelecao = folha.getByRole('button', { name: /^Na seleção/ })
    await expect(daSelecao).toHaveAttribute('aria-expanded', 'false')
    await expect(
      folha.getByRole('button', { name: 'Extrair as selecionadas' }),
    ).toBeHidden()
    const primeira = (await folha
      .getByTestId('editar-pdf-pagina')
      .first()
      .boundingBox())!
    expect(primeira.y + primeira.height).toBeLessThanOrEqual(568)
    expect(
      await folha.evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true)
  })

  test('a 320 × 568 px, o botão "Na seleção" diz quantas estão marcadas, abre a barra e as dicas e as recolhe de novo, com 44 px', async ({
    page,
  }) => {
    const folha = await abrirAFolhaCom20(page)
    await folha
      .getByRole('checkbox', { name: 'Selecionar página 2', exact: true })
      .check()
    const daSelecao = folha.getByRole('button', {
      name: 'Na seleção 1 página selecionada',
    })
    const caixa = (await daSelecao.boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(44)
    expect(caixa.width).toBeGreaterThanOrEqual(44)

    await daSelecao.focus()
    await page.keyboard.press('Enter')
    await expect(daSelecao).toHaveAttribute('aria-expanded', 'true')
    const extrair = folha.getByRole('button', {
      name: 'Extrair as selecionadas',
    })
    await expect(extrair).toBeVisible()
    await expect(
      folha.getByTestId('editar-pdf-dicas-das-paginas'),
    ).toBeVisible()
    await expect(
      folha.locator(`#${await daSelecao.getAttribute('aria-controls')}`),
    ).toContainText('Extrair as selecionadas')

    await page.keyboard.press('Space')
    await expect(daSelecao).toHaveAttribute('aria-expanded', 'false')
    await expect(extrair).toBeHidden()
    await expect(daSelecao).toBeFocused()
  })

  test('a 390 × 844 px, a seleção começa aberta e a lista ainda mostra uma página inteira, sem a folha rolar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfDeTeste(
        'vinte.pdf',
        Array.from({ length: 20 }, () => 100),
      ),
    )
    await page.getByRole('button', { name: 'Páginas', exact: true }).click()
    const folha = page.getByRole('dialog', { name: 'Páginas' })
    await expect(folha).toBeVisible()
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished)),
    )
    await expect(
      folha.getByRole('button', { name: /^Na seleção/ }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(
      folha.getByRole('button', { name: 'Extrair as selecionadas' }),
    ).toBeVisible()
    const primeira = (await folha
      .getByTestId('editar-pdf-pagina')
      .first()
      .boundingBox())!
    expect(primeira.y + primeira.height).toBeLessThanOrEqual(844)
    expect(
      await folha.evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true)
  })
})

// ---- Editor único, PR 4: adicionar outro PDF ----

// Pelo botão Adicionar PDF que está na tela (o da coluna no largo, o curto ao lado de Páginas no celular).
async function adicionarNoEditar(
  page: Page,
  arquivo: { name: string; mimeType: string; buffer: Buffer },
) {
  const [escolha] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Adicionar PDF' }).click(),
  ])
  await escolha.setFiles(arquivo)
}

const anuncioDaAdicao = (nome: string, paginas: number, depoisDa: number) =>
  `${paginas} ${paginas === 1 ? 'página' : 'páginas'} de ${nome} ${paginas === 1 ? 'adicionada' : 'adicionadas'} depois da página ${depoisDa}, já ${paginas === 1 ? 'selecionada' : 'selecionadas'}.`

// Duas páginas de 300 pontos: na primeira, um segredo escrito como string literal (aparece no conteúdo
// cru do arquivo, para a busca por ele valer); a segunda, em branco.
async function pdfComSegredo(nome: string, segredo: string) {
  const documento = await PDFDocument.create()
  await escreverSegredo(documento, documento.addPage([300, 300]), segredo)
  documento.addPage([300, 300])
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await documento.save()),
  }
}

// Em 16 pontos, com a linha de base em (40, 150).
async function escreverSegredo(
  documento: PDFDocument,
  pagina: PDFPage,
  segredo: string,
) {
  const fonte = await documento.embedFont(StandardFonts.Helvetica)
  const nomeDaFonte = pagina.node.newFontDictionary('F1', fonte.ref)
  pagina.pushOperators(
    beginText(),
    setFontAndSize(nomeDaFonte, 16),
    setTextMatrix(1, 0, 0, 1, 40, 150),
    // O tipo pede hex, mas o Tj aceita a string literal, que é o que deixa o segredo legível no arquivo.
    showText(
      PDFString.of(segredo) as unknown as Parameters<typeof showText>[0],
    ),
    endText(),
  )
}

test.describe('Editar PDF: adicionar outro PDF', () => {
  test('sem marcada, o segundo entra no fim; com uma marcada, o terceiro entra depois dela; no PDF baixado, a ordem; e dois Workers no total', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await page.goto('/tools/pdf')
    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 320, 340]))
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    await expect(
      coluna.getByRole('button', { name: 'Adicionar PDF' }),
    ).toHaveAccessibleDescription(
      'Entra no fim, depois da página 3. A página em branco sai em A4.',
    )

    await adicionarNoEditar(page, await pdfDeTeste('b.pdf', [400, 420]))
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      anuncioDaAdicao('b.pdf', 2, 3),
    )
    await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
      'a.pdf + b.pdf · 5 páginas',
    )
    const cartoes = coluna.getByTestId('editar-pdf-pagina')
    await expect(cartoes.nth(3)).toContainText('b.pdf, pág. 1')
    await expect(
      coluna.getByRole('checkbox', { name: 'Selecionar página 4' }),
    ).toBeFocused()
    await expect(
      coluna.getByRole('checkbox', { name: 'Selecionar página 5' }),
    ).toBeChecked()

    await coluna.getByRole('button', { name: 'Limpar seleção' }).click()
    await coluna.getByRole('checkbox', { name: 'Selecionar página 1' }).check()
    await expect(
      coluna.getByRole('button', { name: 'Adicionar PDF' }),
    ).toHaveAccessibleDescription(
      'Entra depois da página 1, a que você marcou. A página em branco sai do tamanho dela.',
    )
    await adicionarNoEditar(page, await pdfDeTeste('c.pdf', [500]))
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      anuncioDaAdicao('c.pdf', 1, 1),
    )
    await expect(cartoes.nth(1)).toContainText('c.pdf, pág. 1')

    const { nome, bytes } = await gerarEBaixar(page)
    expect(nome).toBe('a-editado.pdf')
    const final = await PDFDocument.load(bytes)
    expect(final.getPages().map((p) => p.getSize().width)).toEqual([
      300, 500, 320, 340, 400, 420,
    ])
    // O do pdf-lib e o da sessão do pdf.js: os documentos dos três arquivos dividem o mesmo.
    expect(workers).toHaveLength(2)
  })

  test('texto numa página do segundo arquivo fica onde a tela mostrou, o segredo apagado de verdade no segundo some do PDF, e nada sai do aparelho com dois arquivos e uma imagem', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf')
    const origem = new URL(page.url()).origin
    const capa = await pdfDeTeste('capa.pdf', [300])
    const segredo = 'Segredo 987.654.321-00'
    const dados = await pdfComSegredo('dados.pdf', segredo)
    expect(await todoOConteudoDoPdf(dados.buffer)).toContain('987.654.321')
    const imagem = pngDeTeste('logo.png', 40, 20)
    await abrirNoEditar(page, capa)
    await escolherImagem(page, imagem)
    await page.getByRole('button', { name: 'Inserir no centro' }).click()
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      /^Inserido: /,
    )

    await adicionarNoEditar(page, dados)
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      anuncioDaAdicao('dados.pdf', 2, 1),
    )
    await abrirPagina(page, 2, 3)
    await inserirNoCentro(page, 'Cobrir')
    await posicionar(page, { x: 30, y: 125, largura: 240, altura: 40 })
    await page
      .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
      .click()
    await page
      .getByRole('button', { name: 'Apagar de verdade nesta página' })
      .click()
    await expect(page.getByTestId('editar-pdf-apagar-ligado')).toBeVisible()
    await abrirPagina(page, 3, 3)
    const escrito = await escreverTexto(page, 'Segundo arquivo', {
      x: 50,
      y: 90,
    })
    await expect(page.getByTestId('editar-pdf-alcance')).toBeVisible()

    const { bytes } = await gerarEBaixar(page)
    const lidas = await lerComPdfjs(bytes)
    expect(lidas).toHaveLength(3)
    expect(lidas[1].textos).toEqual([])
    expect(await todoOConteudoDoPdf(bytes)).not.toContain('987.654.321')
    const lido = lidas[2].textos.find((t) => t.str === 'Segundo arquivo')
    expect(lido).toBeDefined()
    conferirCaixa(lido!.matriz, [16, 0, 0, -16, escrito.x, escrito.y], 0.05)
    expect(lidas[0].desenhos.filter((d) => d.tipo === 'imagem')).toHaveLength(1)
    conferirQueNadaSaiu(pedidos, origem, [
      capa.buffer,
      dados.buffer,
      imagem.buffer,
    ])
  })

  test('acima do teto somado de páginas: o alerta diz o que ainda cabe, e o documento fica como estava', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.goto('/tools/pdf')
    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [100, 200, 300]))
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    await coluna.getByRole('checkbox', { name: 'Selecionar página 2' }).check()

    await adicionarNoEditar(
      page,
      await pdfDeTeste(
        'grande.pdf',
        Array.from({ length: 498 }, () => 100),
      ),
    )
    const alerta = page.getByTestId('editar-pdf-recusa-da-adicao')
    await expect(alerta).toHaveText(
      'Não deu para adicionar grande.pdf: ele tem 498 páginas, e só cabem mais 497 páginas (até 500 somando os PDFs abertos). Divida o PDF em partes menores no programa que o criou e adicione uma de cada vez.',
    )
    await expect(alerta).toHaveAttribute('role', 'alert')
    await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
      'a.pdf · 3 páginas',
    )
    await expect(coluna.getByTestId('editar-pdf-pagina')).toHaveCount(3)
    await expect(
      coluna.getByRole('checkbox', { name: 'Selecionar página 2' }),
    ).toBeChecked()
    await expect(
      coluna.getByRole('button', { name: 'Adicionar PDF' }),
    ).toBeFocused()
  })

  test('trocar de documento depois de adicionar tira da página as fontes que o pdf.js carregou para os dois arquivos', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.goto('/tools/pdf')
    await expect(page.getByTestId('pdf-zona')).toBeVisible()
    const fontes = () => page.evaluate(() => document.fonts.size)
    const antes = await fontes()

    await abrirNoEditar(page, await pdfComTexto('contrato.pdf'))
    await expect.poll(fontes).toBeGreaterThan(antes)
    await adicionarNoEditar(page, await pdfComTexto('anexo.pdf'))
    await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
      'contrato.pdf + anexo.pdf · 4 páginas',
    )
    await abrirPagina(page, 3, 4)

    await abrirNoEditar(page, await pdfDeTeste('branco.pdf', [100, 200]))
    await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
      'branco.pdf · 2 páginas',
    )
    await expect.poll(fontes).toBe(antes)
  })

  test('a 320 px, com dois arquivos de nome comprido: o botão curto tem 44 px e fica com o foco, a primeira página nova aparece na faixa, e nada rola para o lado', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfDeTeste(
        'relatorio-trimestral-consolidado-versao-final-2026.pdf',
        Array.from({ length: 8 }, () => 100),
      ),
    )
    const botao = page.getByRole('button', { name: 'Adicionar PDF' })
    await expect(botao).toHaveText('Adicionar PDF')
    const caixa = (await botao.boundingBox())!
    expect(caixa.width).toBeGreaterThanOrEqual(44)
    expect(caixa.height).toBeGreaterThanOrEqual(44)

    await adicionarNoEditar(
      page,
      await pdfDeTeste(
        'anexo-com-os-documentos-pessoais-do-contratante.pdf',
        [200, 300],
      ),
    )
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      anuncioDaAdicao(
        'anexo-com-os-documentos-pessoais-do-contratante.pdf',
        2,
        8,
      ),
    )
    await expect(botao).toBeFocused()
    await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
      'relatorio-trimestral-consolidado-versao-final-2026.pdf + anexo-com-os-documentos-pessoais-do-contratante.pdf · 10 páginas',
    )
    const faixa = page.getByTestId('editar-pdf-faixa')
    const daFaixa = (await faixa.boundingBox())!
    await expect
      .poll(async () => {
        const nova = (await page
          .getByRole('button', { name: 'Página 9', exact: true })
          .boundingBox())!
        return (
          nova.x >= daFaixa.x - 1 &&
          nova.x + nova.width <= daFaixa.x + daFaixa.width + 1
        )
      })
      .toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320)

    await page.getByRole('button', { name: 'Páginas', exact: true }).click()
    const folha = page.getByRole('dialog', { name: 'Páginas' })
    await expect(
      folha.getByText(
        'anexo-com-os-documentos-pessoais-do-contratante.pdf, pág. 1',
      ),
    ).toBeVisible()
    expect(await folha.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    const naFolha = (await folha
      .getByRole('button', { name: 'Adicionar PDF' })
      .boundingBox())!
    expect(naFolha.height).toBeGreaterThanOrEqual(44)
  })

  for (const tema of ['light', 'dark'] as const)
    for (const largura of [1280, 320])
      test(`com dois arquivos e uma recusa, o Adicionar PDF, o alerta, os avisos e o cabeçalho passam de 4,5:1 no tema ${tema} a ${largura} px`, async ({
        page,
      }) => {
        test.setTimeout(60_000)
        await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
        await page.setViewportSize({ width: largura, height: 800 })
        await page.goto('/tools/pdf')
        await abrirNoEditar(
          page,
          await pdfComAvisos('requerimento.pdf', { xfa: true }),
        )
        await adicionarNoEditar(page, await pdfDeTeste('b.pdf', [100, 200]))
        await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
          'requerimento.pdf + b.pdf · 3 páginas',
        )
        await adicionarNoEditar(page, await pdfProtegido('cofre.pdf'))
        await expect(
          page.getByTestId('editar-pdf-recusa-da-adicao'),
        ).toBeVisible()
        await page.evaluate(() =>
          Promise.all(document.getAnimations().map((a) => a.finished)),
        )

        const medidas = await page.evaluate(
          medirContrasteDoTexto,
          '[data-testid="editar-pdf"]',
        )
        // O texto medido vem cortado em 30 caracteres.
        for (const texto of [
          'Adicionar PDF',
          'Não deu para adicionar cofre',
          'requerimento.pdf: Este PDF é',
          'requerimento.pdf + b.pdf',
        ]) {
          expect(
            medidas.some((m) => m.texto.startsWith(texto)),
            texto,
          ).toBe(true)
        }
        expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
      })

  for (const largura of [1280, 320])
    test(`axe (WCAG 2.2 A e AA) sem violação séria a ${largura} px, com dois arquivos, a seleção das páginas novas e o alerta de uma recusa`, async ({
      page,
    }) => {
      test.setTimeout(60_000)
      await page.setViewportSize({ width: largura, height: 800 })
      await page.goto('/tools/pdf')
      await abrirNoEditar(
        page,
        await pdfComAvisos('requerimento.pdf', { assinado: true }),
      )
      await adicionarNoEditar(page, await pdfDeTeste('b.pdf', [100, 200]))
      await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
        'requerimento.pdf + b.pdf · 3 páginas',
      )
      await adicionarNoEditar(page, await pdfProtegido('cofre.pdf'))
      await expect(
        page.getByTestId('editar-pdf-recusa-da-adicao'),
      ).toBeVisible()

      expect(await violacoesDoAxe(page, '[data-testid="editar-pdf"]')).toEqual(
        [],
      )
    })
})

// ---- Editor único, PR 5: a página em branco ----

// A fronteira da folha em branco contra o que está em volta: a borda dela ou a própria folha (o maior dos
// dois contrastes). A grande tem a borda no outline; a miniatura, no traço do SVG (currentColor).
function medirBordasDasBrancas() {
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
  const razao = (a: number[], b: number[]) => {
    const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
    return Math.round(((claro + 0.05) / (escuro + 0.05)) * 100) / 100
  }
  const visivel = (el: Element) => el.getClientRects().length > 0
  const medir = (onde: string, el: Element, borda: string) => {
    const fora = fundoDe(el.parentElement!)
    const comBorda = sobre(rgba(borda), fora)
    return {
      onde,
      razao: Math.max(razao(comBorda, fora), razao([255, 255, 255], fora)),
    }
  }
  const grande = document.querySelector('[data-testid="editar-pdf-folha"]')!
  const estilo = getComputedStyle(grande)
  const miniatura = [
    ...document.querySelectorAll('[data-testid="editar-pdf-folha-branca"]'),
  ].find(visivel)!
  return [
    medir(
      'folha grande',
      grande,
      estilo.outlineStyle === 'none' ? 'transparent' : estilo.outlineColor,
    ),
    medir('miniatura', miniatura, getComputedStyle(miniatura).color),
  ]
}

// Pelo botão que está na tela (o da coluna no largo, o curto ao lado de PDF no celular).
async function criarBrancaNoEditar(page: Page, depoisDa: number) {
  await page.getByRole('button', { name: 'Página em branco' }).click()
  await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
    `Página em branco adicionada depois da página ${depoisDa}, já selecionada.`,
  )
}

// Os pedidos da página ao Worker do pdf.js (o MessageHandler dele põe sourceName em toda mensagem).
function contarPedidosAoPdfjs(page: Page) {
  return page.addInitScript(() => {
    const janela = window as unknown as { pedidosAoPdfjs: string[] }
    janela.pedidosAoPdfjs = []
    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (
      this: Worker,
      mensagem: unknown,
      ...resto: [StructuredSerializeOptions?]
    ) {
      if (
        mensagem &&
        typeof mensagem === 'object' &&
        'sourceName' in mensagem
      ) {
        const { action, stream } = mensagem as {
          action?: string
          stream?: number
        }
        janela.pedidosAoPdfjs.push(String(action ?? stream))
      }
      return original.call(this, mensagem, ...resto)
    } as typeof Worker.prototype.postMessage
  })
}

const pedidosAoPdfjs = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { pedidosAoPdfjs: string[] }).pedidosAoPdfjs.length,
  )

// Três páginas: a do meio é de pé (300 × 500) com /Rotate 90, então aparece deitada (500 × 300).
async function pdfComDeitada(nome: string) {
  const documento = await PDFDocument.create()
  documento.addPage([300, 300])
  documento.addPage([300, 500]).setRotation(degrees(90))
  documento.addPage([340, 340])
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await documento.save()),
  }
}

// O /Kids repete a primeira página no fim: três posições, dois nós (aceito pelo pdf.js e pelo pdf-lib).
// Com `segredo`, a repetida o mostra como o pdfComSegredo.
async function pdfComPaginaRepetida(nome: string, segredo?: string) {
  const documento = await PDFDocument.create()
  documento.setTitle('Título do arquivo')
  const repetida = documento.addPage([300, 300])
  if (segredo) await escreverSegredo(documento, repetida, segredo)
  documento.addPage([320, 320])
  const arvore = documento.catalog.Pages()
  arvore.Kids().push(documento.getPage(0).ref)
  arvore.set(PDFName.of('Count'), PDFNumber.of(3))
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await documento.save()),
  }
}

const textosDasPaginas = async (bytes: Uint8Array) =>
  (await lerComPdfjs(bytes)).map(({ textos }) => textos.map(({ str }) => str))

test.describe('Editar PDF: página em branco', () => {
  test('com a página deitada marcada (P2 e P3): a branca entra deitada logo depois dela, aberta e selecionada; no PDF baixado, o MediaBox deitado sem /Rotate e o texto onde a tela mostrou, sem nada sair do aparelho', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const pedidos = vigiarPedidos(page)
    await page.goto('/tools/pdf')
    const origem = new URL(page.url()).origin
    const arquivo = await pdfComDeitada('deitada.pdf')
    await abrirNoEditar(page, arquivo)
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    await coluna.getByRole('checkbox', { name: 'Selecionar página 2' }).check()
    await expect(
      coluna.getByRole('button', { name: 'Página em branco' }),
    ).toHaveAccessibleDescription(
      'Entra depois da página 2, a que você marcou. A página em branco sai do tamanho dela.',
    )

    await criarBrancaNoEditar(page, 2)
    await expect(page.getByTestId('editar-pdf-posicao')).toHaveText(
      'Página 3 de 4',
    )
    await expect(page.getByTestId('editar-pdf-area')).toBeFocused()
    await expect(
      coluna.getByRole('checkbox', { name: 'Selecionar página 3' }),
    ).toBeChecked()
    await expect(coluna.getByTestId('editar-pdf-origem').nth(2)).toHaveText(
      'Página em branco, 17,6 × 10,6 cm',
    )
    await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
      'deitada.pdf + 1 página em branco · 4 páginas',
    )
    const folha = page.getByRole('img', { name: 'Página 3, em branco' })
    const caixa = (await folha.boundingBox())!
    expect(caixa.width / caixa.height).toBeCloseTo(500 / 300, 1)
    await expect(page.getByTestId('editar-pdf-canvas')).toBeHidden()
    const escrito = await escreverTexto(page, 'Na branca', { x: 40, y: 60 })

    const { nome, bytes } = await gerarEBaixar(page)
    expect(nome).toBe('deitada-editado.pdf')
    const final = await PDFDocument.load(bytes)
    expect(
      final.getPages().map((p) => {
        const { width, height } = p.getSize()
        return [width, height, p.getRotation().angle]
      }),
    ).toEqual([
      [300, 300, 0],
      [300, 500, 90],
      [500, 300, 0],
      [340, 340, 0],
    ])
    const lidas = await lerComPdfjs(bytes)
    const lido = lidas[2].textos.find((t) => t.str === 'Na branca')
    expect(lido).toBeDefined()
    conferirCaixa(lido!.matriz, [16, 0, 0, -16, escrito.x, escrito.y], 0.05)
    conferirQueNadaSaiu(pedidos, origem, [arquivo.buffer])
  })

  test('sem marcada, A4 no fim e nenhum pedido ao pdf.js para ela; com dois arquivos e duas brancas, a ordem e os tamanhos no PDF baixado, e dois Workers no total', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await contarPedidosAoPdfjs(page)
    // A 1280 × 720, a lista da coluna fica abaixo da margem do IntersectionObserver e corta o segundo
    // cartão: as miniaturas que o teste conta não seriam desenhadas.
    await page.setViewportSize({ width: 1280, height: 1100 })
    await page.goto('/tools/pdf')
    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 320]))
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    await expect(coluna.getByTestId('editar-pdf-cartao-miniatura')).toHaveCount(
      2,
    )
    // A abertura e as miniaturas terminaram quando a contagem para de mudar.
    let antes = -1
    await expect
      .poll(async () => {
        const agora = await pedidosAoPdfjs(page)
        const parou = agora === antes
        antes = agora
        return parou
      })
      .toBe(true)

    await criarBrancaNoEditar(page, 2)
    await expect(
      page.getByRole('img', { name: 'Página 3, em branco' }),
    ).toBeVisible()
    await expect(coluna.getByTestId('editar-pdf-folha-branca')).toHaveCount(1)
    await expect(coluna.getByTestId('editar-pdf-origem').nth(2)).toHaveText(
      'Página em branco, A4',
    )
    await page.waitForTimeout(1_000)
    expect(await pedidosAoPdfjs(page)).toBe(antes)

    await adicionarNoEditar(page, await pdfDeTeste('b.pdf', [400]))
    await expect(page.getByTestId('editar-pdf-anuncio')).toHaveText(
      anuncioDaAdicao('b.pdf', 1, 3),
    )
    await criarBrancaNoEditar(page, 4)
    await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
      'a.pdf + b.pdf + 2 páginas em branco · 5 páginas',
    )
    await expect(page.getByTestId('editar-pdf-alcance')).toBeVisible()

    const { nome, bytes } = await gerarEBaixar(page)
    expect(nome).toBe('a-editado.pdf')
    const final = await PDFDocument.load(bytes)
    expect(
      final.getPages().map((p) => {
        const { width, height } = p.getSize()
        return [Math.round(width * 100) / 100, Math.round(height * 100) / 100]
      }),
    ).toEqual([
      [300, 300],
      [320, 320],
      [595.28, 841.89],
      [400, 400],
      [400, 400],
    ])
    expect(workers).toHaveLength(2)
  })

  test('Extrair com a branca: sai na ordem do documento, com o aviso de alcance; só a branca sai com o nome das páginas em branco', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.goto('/tools/pdf')
    await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 320]))
    const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')
    await criarBrancaNoEditar(page, 2)
    await coluna.getByRole('checkbox', { name: 'Selecionar página 2' }).check()

    const extrairEBaixar = async () => {
      await coluna
        .getByRole('button', { name: 'Extrair as selecionadas' })
        .click()
      const baixar = page.getByTestId('editar-pdf-baixar')
      await expect(baixar).toBeFocused({ timeout: 30_000 })
      await expect(page.getByTestId('editar-pdf-alcance')).toBeVisible()
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        baixar.click(),
      ])
      return {
        nome: download.suggestedFilename(),
        pdf: await lerPdfBaixado(download),
      }
    }
    const lados = (pdf: PDFDocument) =>
      pdf.getPages().map((p) => Math.round(p.getSize().width * 100) / 100)

    const duas = await extrairEBaixar()
    expect(duas.nome).toBe('a-paginas.pdf')
    expect(lados(duas.pdf)).toEqual([320, 595.28])

    await coluna.getByRole('button', { name: 'Limpar seleção' }).click()
    await coluna.getByRole('checkbox', { name: 'Selecionar página 3' }).check()
    const so = await extrairEBaixar()
    expect(so.nome).toBe('paginas-em-branco-paginas.pdf')
    expect(lados(so.pdf)).toEqual([595.28])
  })

  test('o nó repetido no /Kids com objetos nas duas posições: no PDF baixado, no lugar e por cópia, cada posição só com o seu', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.goto('/tools/pdf')
    await abrirNoEditar(page, await pdfComPaginaRepetida('repetida.pdf'))
    await expect(page.getByTestId('editar-pdf-documento')).toHaveText(
      'repetida.pdf · 3 páginas',
    )
    await escreverTexto(page, 'AAA', { x: 40, y: 60 })
    await abrirPagina(page, 3, 3)
    await escreverTexto(page, 'BBB', { x: 40, y: 120 })

    const noLugar = await gerarEBaixar(page)
    expect(await textosDasPaginas(noLugar.bytes)).toEqual([
      ['AAA'],
      [],
      ['BBB'],
    ])
    expect((await PDFDocument.load(noLugar.bytes)).getTitle()).toBe(
      'Título do arquivo',
    )

    await page
      .getByTestId('editar-pdf-coluna-de-paginas')
      .getByRole('button', { name: 'Apagar a página 2' })
      .click()
    const porCopia = await gerarEBaixar(page)
    expect(await textosDasPaginas(porCopia.bytes)).toEqual([['AAA'], ['BBB']])
  })

  // Regressão do PR 6, pelo caminho que a recusa ensina: tirado o apagar de verdade de uma das posições,
  // o cobrir dela fica como um retângulo comum, e o PDF baixado saía com o segredo no texto dessa posição.
  test('o nó repetido no /Kids com o segredo coberto nas duas posições: a recusa, o apagar de verdade tirado de uma e, no PDF baixado, no lugar e por cópia, o segredo em página nenhuma', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const arquivo = await pdfComPaginaRepetida(
      'repetida.pdf',
      'Segredo 987.654.321-00',
    )
    expect(await todoOConteudoDoPdf(arquivo.buffer)).toContain('987.654.321')
    await page.goto('/tools/pdf')
    await abrirNoEditar(page, arquivo)
    for (const numero of [1, 3]) {
      await abrirPagina(page, numero, 3)
      await inserirNoCentro(page, 'Cobrir')
      await posicionar(page, { x: 30, y: 125, largura: 240, altura: 40 })
      await page
        .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
        .click()
      await page
        .getByRole('button', { name: 'Apagar de verdade nesta página' })
        .click()
      await expect(page.getByTestId('editar-pdf-apagar-ligado')).toBeVisible()
    }

    await page.getByRole('button', { name: 'Gerar PDF', exact: true }).click()
    await expect(page.getByTestId('editar-pdf-falha-ao-gerar')).toContainText(
      'A página 3 é a mesma página do arquivo que outra página deste PDF',
    )
    await page.getByRole('button', { name: 'Só cobrir, sem apagar' }).click()
    await expect(page.getByTestId('editar-pdf-apagar-ligado')).toHaveCount(0)

    const semOSegredo = async (bytes: Uint8Array, paginas: number) => {
      const lidas = await lerComPdfjs(bytes)
      expect(lidas).toHaveLength(paginas)
      expect(
        lidas.flatMap(({ textos }) => textos.map(({ str }) => str)),
      ).toEqual([])
      expect(await todoOConteudoDoPdf(bytes)).not.toContain('987.654.321')
    }
    await semOSegredo((await gerarEBaixar(page)).bytes, 3)

    await page
      .getByTestId('editar-pdf-coluna-de-paginas')
      .getByRole('button', { name: 'Apagar a página 2' })
      .click()
    await semOSegredo((await gerarEBaixar(page)).bytes, 2)
  })

  // Decisão do Paulo em 2026-11-18: o apagar de verdade numa posição protege todas as posições do mesmo
  // nó, também quando a apagada fica fora do PDF. Antes, a outra posição saía com o segredo no texto.
  for (const caminho of ['extrair', 'gerar'] as const)
    test(`o nó repetido no /Kids com o segredo apagado de verdade na posição 1: ${caminho === 'extrair' ? 'o Extrair só da 3' : 'o Gerar depois de tirar a 1 da Bancada'} sai sem o segredo`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      const arquivo = await pdfComPaginaRepetida(
        'repetida.pdf',
        'Segredo 987.654.321-00',
      )
      await page.goto('/tools/pdf')
      await abrirNoEditar(page, arquivo)
      await abrirPagina(page, 1, 3)
      await inserirNoCentro(page, 'Cobrir')
      await posicionar(page, { x: 30, y: 125, largura: 240, altura: 40 })
      await page
        .getByRole('button', { name: 'Apagar de verdade o que está embaixo' })
        .click()
      await page
        .getByRole('button', { name: 'Apagar de verdade nesta página' })
        .click()
      await expect(page.getByTestId('editar-pdf-apagar-ligado')).toBeVisible()
      const coluna = page.getByTestId('editar-pdf-coluna-de-paginas')

      let bytes: Uint8Array
      if (caminho === 'extrair') {
        await coluna
          .getByRole('checkbox', { name: 'Selecionar página 3' })
          .check()
        await coluna
          .getByRole('button', { name: 'Extrair as selecionadas' })
          .click()
        const baixar = page.getByTestId('editar-pdf-baixar')
        await expect(baixar).toBeFocused({ timeout: 30_000 })
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          baixar.click(),
        ])
        bytes = new Uint8Array(readFileSync((await download.path())!))
      } else {
        await coluna.getByRole('button', { name: 'Apagar a página 1' }).click()
        bytes = (await gerarEBaixar(page)).bytes
      }

      const lidas = await lerComPdfjs(bytes)
      expect(lidas).toHaveLength(caminho === 'extrair' ? 1 : 2)
      expect(
        lidas.flatMap(({ textos }) => textos.map(({ str }) => str)),
      ).toEqual([])
      expect(await todoOConteudoDoPdf(bytes)).not.toContain('987.654.321')
    })

  test('a 320 px: o curto "Em branco" tem 44 px, criar abre a branca na faixa com o foco na área, a folha também tem o botão, e nada rola para o lado', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/tools/pdf')
    await abrirNoEditar(
      page,
      await pdfDeTeste(
        'relatorio-trimestral-consolidado-versao-final-2026.pdf',
        Array.from({ length: 8 }, () => 100),
      ),
    )
    const botao = page.getByRole('button', { name: 'Página em branco' })
    await expect(botao).toHaveText('Em branco')
    const caixa = (await botao.boundingBox())!
    expect(caixa.width).toBeGreaterThanOrEqual(44)
    expect(caixa.height).toBeGreaterThanOrEqual(44)

    await criarBrancaNoEditar(page, 8)
    await expect(page.getByTestId('editar-pdf-area')).toBeFocused()
    await expect(
      page.getByRole('button', { name: 'Página 9', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      page.getByRole('img', { name: 'Página 9, em branco' }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320)

    await page.getByRole('button', { name: 'Páginas', exact: true }).click()
    const folha = page.getByRole('dialog', { name: 'Páginas' })
    await expect(folha.getByText('Página em branco, A4')).toBeVisible()
    const naFolha = (await folha
      .getByRole('button', { name: 'Página em branco' })
      .boundingBox())!
    expect(naFolha.height).toBeGreaterThanOrEqual(44)
    expect(await folha.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
  })

  for (const tema of ['light', 'dark'] as const)
    for (const largura of [1280, 320])
      test(`com a branca aberta e um cobrir nela, o botão, a origem, o cabeçalho e o aviso do cobrir passam de 4,5:1 no tema ${tema} a ${largura} px`, async ({
        page,
      }) => {
        test.setTimeout(60_000)
        await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
        await page.setViewportSize({ width: largura, height: 800 })
        await page.goto('/tools/pdf')
        await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 320]))
        await criarBrancaNoEditar(page, 2)
        await inserirNoCentro(page, 'Cobrir')
        await expect(page.getByTestId('editar-pdf-cobrir')).toContainText(
          'Esta página é em branco',
        )
        await page.evaluate(() =>
          Promise.all(document.getAnimations().map((a) => a.finished)),
        )

        const medidas = await page.evaluate(
          medirContrasteDoTexto,
          '[data-testid="editar-pdf"]',
        )
        // O texto medido vem cortado em 30 caracteres.
        for (const texto of [
          largura === 320 ? 'Em branco' : 'Página em branco',
          'a.pdf + 1 página em branco',
          'Esta página é em branco',
        ]) {
          expect(
            medidas.some((m) => m.texto.startsWith(texto)),
            texto,
          ).toBe(true)
        }
        expect(medidas.filter((m) => m.razao < 4.5)).toEqual([])
      })

  // Da revisão: no tema claro, a folha branca sobre o fundo claro da área quase sumia (1,09:1), e na branca
  // a borda é a única pista de onde clicar ou pôr o objeto (WCAG 1.4.11, 3:1).
  for (const tema of ['light', 'dark'] as const)
    for (const largura of [1280, 320])
      test(`a borda da folha em branco, grande e na miniatura, passa de 3:1 contra o fundo no tema ${tema} a ${largura} px`, async ({
        page,
      }) => {
        test.setTimeout(60_000)
        await page.addInitScript((t) => localStorage.setItem('theme', t), tema)
        await page.setViewportSize({ width: largura, height: 800 })
        await page.goto('/tools/pdf')
        await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 320]))
        await criarBrancaNoEditar(page, 2)
        // O finished de uma animação cancelada rejeita; aqui só importa que nenhuma esteja rodando.
        await page.evaluate(() =>
          Promise.all(
            document.getAnimations().map((a) => a.finished.catch(() => null)),
          ),
        )

        const medidas = await page.evaluate(medirBordasDasBrancas)
        expect(medidas.map(({ onde }) => onde)).toEqual([
          'folha grande',
          'miniatura',
        ])
        expect(medidas.filter(({ razao }) => razao < 3)).toEqual([])
      })

  for (const largura of [1280, 320])
    test(`axe (WCAG 2.2 A e AA) sem violação séria a ${largura} px, com a branca aberta, selecionada e com um cobrir`, async ({
      page,
    }) => {
      test.setTimeout(60_000)
      await page.setViewportSize({ width: largura, height: 800 })
      await page.goto('/tools/pdf')
      await abrirNoEditar(page, await pdfDeTeste('a.pdf', [300, 320]))
      await criarBrancaNoEditar(page, 2)
      await inserirNoCentro(page, 'Cobrir')

      expect(await violacoesDoAxe(page, '[data-testid="editar-pdf"]')).toEqual(
        [],
      )
    })
})
