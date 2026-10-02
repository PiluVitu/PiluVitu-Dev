import type { BrowserContext, Worker } from '@playwright/test'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { browser } from 'wxt/browser'
import {
  abrirPopup,
  enviarMensagem,
  expect,
  idDaAba,
  ORIGEM,
  servir,
  test,
} from '../src/test/extensao.fixture'
import { PESSOA_DOURADA } from '../src/test/pessoa-dourada'
import {
  arquivoDaCaptura,
  arquivoDaOpera,
  CAPTURAS,
  CENAS_DA_OPERA,
  COPIAS,
  ICONE,
  LOGO_DO_EDGE,
  TAMANHO_DA_OPERA,
  TAMANHOS_DAS_CAPTURAS,
  TEMAS,
  TILE_DA_CHROME,
  type Cena,
  type CenaDeDestaque,
  type Tema,
} from './pecas'
import {
  dataUrl,
  htmlDestaque,
  htmlIcone,
  htmlPagina,
  htmlTile,
} from './quadros'

declare const chrome: typeof browser

const LOJA = path.resolve(import.meta.dirname, 'imagens')
const APPS = path.resolve(import.meta.dirname, '../..')
const STORYBOOK = path.resolve(import.meta.dirname, '../storybook-static')
const STORYBOOK_URL = 'http://storybook.local'
const SVG = readFileSync(path.join(import.meta.dirname, 'icone-1i.svg'), 'utf8')
const FONTE = dataUrl(
  'font/woff2',
  readFileSync(
    path.resolve(
      import.meta.dirname,
      '../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
    ),
  ),
)
const VITRINE = readFileSync(
  path.join(import.meta.dirname, 'vitrine.pagina.html'),
  'utf8',
)

const STORY_DO_POPUP: Record<Cena, string> = {
  'pagina-preenchida': 'popup-1c-·-resultado',
  'pessoa-de-teste': 'popup-1b-·-pessoa-pronta',
  resultado: 'popup-1c-·-resultado',
}
const TEXTOS: Record<CenaDeDestaque, { titulo: string; subtitulo: string }> = {
  'pessoa-de-teste': {
    titulo: 'Uma pessoa de teste coerente e pronta para copiar',
    subtitulo:
      'CPF, CNPJ, RG, PIS e título com dígito verificador certo, CEP real com rua e cidade e o cartão de teste da Stripe.',
  },
  resultado: {
    titulo: 'Mostra o que preencheu e o que ficou de fora',
    subtitulo:
      'A mira leva até cada campo que o Botaí não reconheceu. Tudo roda no seu navegador: nada é enviado.',
  },
}

function gravar(arquivo: string, png: Buffer): void {
  const destino = path.join(LOJA, arquivo)
  mkdirSync(path.dirname(destino), { recursive: true })
  writeFileSync(destino, png)
}

async function servirStorybook(context: BrowserContext): Promise<void> {
  await context.route(`${STORYBOOK_URL}/**`, (rota) => {
    const arquivo = path.join(
      STORYBOOK,
      decodeURIComponent(new URL(rota.request().url()).pathname),
    )
    const existe = statSync(arquivo, { throwIfNoEntry: false })?.isFile()
    return existe
      ? rota.fulfill({ path: arquivo })
      : rota.fulfill({ status: 404, body: 'não encontrado' })
  })
}

async function fotografarStory(
  context: BrowserContext,
  id: string,
): Promise<Buffer> {
  const pagina = await context.newPage()
  await pagina.goto(
    `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`,
  )
  // O layout "padded" do Storybook põe 1rem no body e encolheria o popup para 348 px.
  await pagina.addStyleTag({ content: 'body { padding: 0 !important; }' })
  const popup = pagina.locator('#storybook-root > div')
  await expect(popup).toHaveCSS('width', '380px')
  await pagina.evaluate(() => document.fonts.ready)
  const png = await popup.screenshot({ scale: 'device' })
  await pagina.close()
  return png
}

async function fotografarHtml(
  context: BrowserContext,
  html: string,
  tamanho: { largura: number; altura: number },
  transparente = false,
): Promise<Buffer> {
  const pagina = await context.newPage()
  await pagina.setViewportSize({
    width: tamanho.largura,
    height: tamanho.altura,
  })
  await pagina.setContent(html)
  await pagina.evaluate(() => document.fonts.ready)
  const png = await pagina.screenshot({
    scale: 'css',
    omitBackground: transparente,
  })
  await pagina.close()
  return png
}

async function fotografarPaginaPreenchida(
  context: BrowserContext,
  sw: Worker,
  extensionId: string,
): Promise<Buffer> {
  await sw.evaluate(
    (pessoa) => chrome.storage.local.set({ botai_pessoa: pessoa }),
    PESSOA_DOURADA,
  )
  await servir(context, { '/cadastro': { corpo: VITRINE } })
  const aba = await context.newPage()
  await aba.setViewportSize({ width: 1280, height: 800 })
  await aba.goto(`${ORIGEM}/cadastro`)
  const tabId = await idDaAba(sw, `${ORIGEM}/cadastro`)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)
  await enviarMensagem(popup, { tipo: 'preencher', tabId })
  await popup.close()
  // 12 de 14 é o mesmo resumo da story do 1c que vai por cima da página.
  await expect(aba.locator('botai-aviso .botai-titulo')).toHaveText(
    '12 de 14 campos preenchidos',
  )
  await expect(aba.locator('input[name="cpf"]')).toHaveValue(PESSOA_DOURADA.cpf)
  // O aviso fecha no fim da barra de tempo: parada no início, a foto não depende de quanto o teste demorou.
  await aba.locator('botai-aviso .botai-barra').evaluate((barra) => {
    for (const animacao of barra.getAnimations()) {
      animacao.pause()
      animacao.currentTime = 0
    }
  })
  return aba.screenshot({ scale: 'device' })
}

async function verificarMargemDoIcone(
  context: BrowserContext,
  png: Buffer,
): Promise<void> {
  const pagina = await context.newPage()
  const caixa = await pagina.evaluate(
    async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const tela = document.createElement('canvas')
      tela.width = img.width
      tela.height = img.height
      const ctx = tela.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const { data, width, height } = ctx.getImageData(
        0,
        0,
        img.width,
        img.height,
      )
      let x0 = width
      let y0 = height
      let x1 = -1
      let y1 = -1
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (data[(y * width + x) * 4 + 3] > 0) {
            x0 = Math.min(x0, x)
            y0 = Math.min(y0, y)
            x1 = Math.max(x1, x)
            y1 = Math.max(y1, y)
          }
      return { largura: width, altura: height, x0, y0, x1, y1 }
    },
    dataUrl('image/png', png),
  )
  await pagina.close()
  expect(caixa).toEqual({
    largura: 128,
    altura: 128,
    x0: 16,
    y0: 16,
    x1: 111,
    y1: 111,
  })
}

test('ícone 128 da loja, logo do Edge e tile da Chrome', async ({
  context,
}) => {
  const icone = await fotografarHtml(
    context,
    htmlIcone({ svg: SVG, arte: 96 }),
    ICONE,
    true,
  )
  await verificarMargemDoIcone(context, icone)
  gravar(ICONE.arquivo, icone)
  gravar(
    LOGO_DO_EDGE.arquivo,
    await fotografarHtml(
      context,
      htmlIcone({ svg: SVG, arte: LOGO_DO_EDGE.largura }),
      LOGO_DO_EDGE,
      true,
    ),
  )
  gravar(
    TILE_DA_CHROME.arquivo,
    await fotografarHtml(
      context,
      htmlTile({ svg: SVG, fonte: FONTE }),
      TILE_DA_CHROME,
    ),
  )
})

for (const tema of TEMAS) {
  test.describe(`capturas no tema ${tema}`, () => {
    test.use({ aparencia: { tema, escala: 2 } })

    test(`página preenchida e popups (${tema})`, async ({
      context,
      sw,
      extensionId,
    }) => {
      await servirStorybook(context)
      const fundo = dataUrl(
        'image/png',
        await fotografarPaginaPreenchida(context, sw, extensionId),
      )
      const popup = async (cena: Cena, t: Tema) =>
        dataUrl(
          'image/png',
          await fotografarStory(context, `${STORY_DO_POPUP[cena]}--${t}`),
        )

      for (const captura of CAPTURAS.filter((c) => c.tema === tema)) {
        const imagemDoPopup = await popup(captura.cena, tema)
        const html =
          captura.cena === 'pagina-preenchida'
            ? htmlPagina({ fundo, popup: imagemDoPopup })
            : htmlDestaque({
                svg: SVG,
                popup: imagemDoPopup,
                tema,
                fonte: FONTE,
                ...TEXTOS[captura.cena],
              })
        for (const tamanho of TAMANHOS_DAS_CAPTURAS)
          gravar(
            arquivoDaCaptura(captura, tamanho),
            await fotografarHtml(context, html, tamanho),
          )
      }

      if (tema !== 'claro') return
      for (const cena of CENAS_DA_OPERA) {
        const html = htmlDestaque({
          svg: SVG,
          popup: await popup(cena, 'claro'),
          tema: 'claro',
          fonte: FONTE,
          fundoBranco: true,
          ...TEXTOS[cena],
        })
        gravar(
          arquivoDaOpera(cena),
          await fotografarHtml(context, html, TAMANHO_DA_OPERA),
        )
      }
    })
  })
}

test('cópias para os sites (apps/web e apps/botai-site)', () => {
  for (const { origem, destino } of COPIAS) {
    mkdirSync(path.dirname(path.join(APPS, destino)), { recursive: true })
    copyFileSync(path.join(LOJA, origem), path.join(APPS, destino))
  }
})
