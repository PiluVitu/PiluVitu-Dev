import { expect, test } from '@playwright/test'
import { LOJA_UI } from '../components/lojas-ui'
import { CAPTURAS } from '../lib/capturas'
import { lerUrlsDasLojas } from '../lib/cms'
import { botoesDasLojas } from '../lib/modelo'

// O esperado sai do mesmo YAML que a página lê no build.
const botoes = botoesDasLojas(lerUrlsDasLojas())

test.describe('/', () => {
  test('as seções do design, na ordem, sem erro de hidratação', async ({
    page,
  }) => {
    const erros: string[] = []
    page.on('console', (mensagem) => {
      if (
        mensagem.type() === 'error' &&
        /hydrat|#418|#423|#425/i.test(mensagem.text())
      )
        erros.push(mensagem.text())
    })
    const resposta = await page.goto('/')
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Botaí: Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Por que existe',
      'O que ele bota',
      'Capturas',
      'Como usar',
      'Privacidade',
      'Cuidados',
      'Bota aí no seu navegador',
    ])
    await page.waitForLoadState('networkidle')
    expect(erros).toEqual([])
  })

  test('botões de loja seguem o CMS: link na publicada, "Em breve" sem link na que falta', async ({
    page,
  }) => {
    await page.goto('/')
    for (const { loja, url } of botoes) {
      const rotulo = LOJA_UI[loja].rotulo
      if (url) {
        const links = page.getByRole('link', { name: rotulo, exact: true })
        await expect(links).toHaveCount(2)
        for (const link of await links.all()) {
          await expect(link).toHaveAttribute('href', url)
          await expect(link).toHaveAttribute('target', '_blank')
        }
      } else {
        const botoesDesabilitados = page.getByRole('button', {
          name: `${rotulo} Em breve`,
        })
        await expect(botoesDesabilitados).toHaveCount(2)
        for (const botao of await botoesDesabilitados.all())
          await expect(botao).toBeDisabled()
      }
    }
    if (!botoes.some(({ loja }) => loja === 'edge'))
      await expect(page.getByText('Microsoft Edge Add-ons')).toHaveCount(0)
    await expect(page.locator('a[href="#"]')).toHaveCount(0)
  })

  test('as âncoras do topo levam às seções', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'como usar' }).click()
    await expect(page).toHaveURL(/#como-usar$/)
    await expect(
      page.getByRole('heading', { level: 2, name: 'Como usar' }),
    ).toBeInViewport()
  })

  test('o topo volta para a PiluLabs no piluvitu.com.br, e o suporte leva [Botaí] no assunto', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(
      page
        .getByRole('navigation', { name: 'Topo' })
        .getByRole('link', { name: 'PiluLabs' }),
    ).toHaveAttribute('href', 'https://piluvitu.com.br/pilulabs')
    const suporte = page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Suporte' })
    expect(
      new URL((await suporte.getAttribute('href')) as string).searchParams.get(
        'subject',
      ),
    ).toBe('[Botaí] Suporte')
  })

  test('abas das capturas pelo teclado (WAI-ARIA)', async ({ page }) => {
    await page.goto('/')
    const abas = page.getByRole('tab')
    await expect(abas).toHaveCount(3)
    await abas.first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(abas.nth(1)).toBeFocused()
    await expect(abas.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toContainText(CAPTURAS[1].titulo)
    await page.keyboard.press('End')
    await expect(abas.nth(2)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(abas.first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(abas.nth(2)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('tabpanel')).toBeFocused()
  })

  // Sem piscar: a classe tem de vir do script inline do next-themes, antes de qualquer JS do React.
  // Com os bundles bloqueados nada hidrata, e a leitura é uma só (toHaveClass repetiria por 5 s e
  // aceitaria uma classe posta depois da primeira pintura). O CSS também mora em /_next/static/chunks/
  // no build do Next 16: só o .js é bloqueado.
  test('tema: o escuro do sistema já vem do HTML, antes do JS do React', async ({
    page,
  }) => {
    await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, (rota) =>
      rota.abort(),
    )
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(await page.locator('html').getAttribute('class')).toMatch(/\bdark\b/)
    const topo = page.getByRole('banner')
    await expect(
      topo.locator(`img[alt="${CAPTURAS[0].variantes.escuro.alt}"]`),
    ).toBeVisible()
    await expect(
      topo.locator(`img[alt="${CAPTURAS[0].variantes.claro.alt}"]`),
    ).toBeHidden()
  })

  test('tema: alterna, lembra a escolha e troca o ícone', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    const botao = page.getByRole('button', { name: 'Alternar tema' })
    await expect(botao.locator('svg[data-icon="sun"]')).toBeVisible()
    await expect(botao.locator('svg[data-icon="moon"]')).toBeHidden()
    await botao.click()
    await expect(page.locator('html')).toHaveClass(/\blight\b/)
    await expect(botao.locator('svg[data-icon="moon"]')).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/\blight\b/)
  })

  // Review Focus 2: a escolha manda, não o prefers-color-scheme, e a variante escondida não sai pela rede.
  test('a captura segue o tema ativo e só a variante dele é baixada', async ({
    page,
  }) => {
    const pedidas: string[] = []
    page.on('request', (pedido) => {
      const url = decodeURIComponent(pedido.url())
      if (url.includes('/capturas/')) pedidas.push(url)
    })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(
      pedidas.some((u) => u.includes('01-pagina-preenchida-escuro.png')),
    ).toBe(true)
    expect(pedidas.filter((u) => u.includes('-claro.png'))).toEqual([])
    await page.getByRole('button', { name: 'Alternar tema' }).click()
    await expect(
      page.getByRole('img', { name: CAPTURAS[0].variantes.claro.alt }).first(),
    ).toBeVisible()
    await expect
      .poll(() =>
        pedidas.some((u) => u.includes('02-pagina-preenchida-claro.png')),
      )
      .toBe(true)
  })

  test.describe('atalho de quem visita', () => {
    const CASOS = [
      [
        'MacIntel',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        '⌥⇧P',
        'macOS',
      ],
      [
        'Linux x86_64',
        'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0',
        'Alt+Shift+P',
        'Linux',
      ],
      [
        'Win32',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'Ctrl+Shift+Y',
        'Windows',
      ],
    ] as const

    for (const [plataforma, userAgent, tecla, sistema] of CASOS) {
      test(`${sistema}: ${tecla}`, async ({ page }) => {
        await page.addInitScript(
          ({ plataforma, userAgent }) => {
            Object.defineProperty(Navigator.prototype, 'platform', {
              get: () => plataforma,
            })
            Object.defineProperty(Navigator.prototype, 'userAgent', {
              get: () => userAgent,
            })
            Object.defineProperty(Navigator.prototype, 'userAgentData', {
              get: () => undefined,
            })
          },
          { plataforma, userAgent },
        )
        await page.goto('/')
        const cabecalho = page.getByRole('banner')
        await expect(cabecalho.locator('kbd')).toHaveText(tecla)
        await expect(cabecalho).toContainText(`preenche a página no ${sistema}`)
      })
    }

    test('sem JavaScript, o HTML do servidor já traz um atalho válido', async ({
      browser,
    }) => {
      const contexto = await browser.newContext({ javaScriptEnabled: false })
      const page = await contexto.newPage()
      await page.goto('/')
      await expect(page.getByRole('banner').locator('kbd')).toHaveText(
        'Ctrl+Shift+Y',
      )
      await contexto.close()
    })
  })

  // Review Focus 3.
  test.describe('a 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('sem rolagem horizontal', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })

    // Um botão que vaza para dentro do gutter não aumenta o scrollWidth: confere cada um contra a lista.
    test('nenhum botão de loja passa da borda da lista', async ({ page }) => {
      await page.goto('/')
      const listas = page.getByRole('list', { name: 'Instalar pela loja' })
      await expect(listas).toHaveCount(2)
      const vazados = await listas.evaluateAll((elementos) =>
        elementos.flatMap((lista) => {
          const borda = lista.getBoundingClientRect().right
          return [...lista.querySelectorAll(':scope > li > *')]
            .filter(
              (botao) => botao.getBoundingClientRect().right > borda + 0.5,
            )
            .map((botao) => botao.textContent ?? '')
        }),
      )
      expect(vazados).toEqual([])
    })
  })
})
