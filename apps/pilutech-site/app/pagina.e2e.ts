import { expect, test, type Page } from '@playwright/test'
import { lerFaseDoBotai } from '../lib/cms'
import { BOTAI, cartoesDosProjetos } from '../lib/conteudo'
import { WHATSAPP } from '../lib/contato'
import { rgbDoToken } from '../lib/tokens-do-ds'

// O esperado sai do mesmo YAML que a página lê no build.
const cartoes = cartoesDosProjetos(lerFaseDoBotai())

const fundo = (page: Page, seletor: string) =>
  page.locator(seletor).evaluate((el) => getComputedStyle(el).backgroundColor)

const H2_DO_CORPO = [
  'Do primeiro protótipo ao servidor em produção.',
  'Quatro etapas, com escopo e valor por escrito.',
  'Produtos próprios da PiluTech.',
  'Ferramentas usadas no dia a dia.',
  'Seu aplicativo atualizado, monitorado e no ar.',
]

// Review Focus 1: um elemento que vaza para o gutter não aumenta o scrollWidth da página. Confere cada
// elemento contra a área de conteúdo (sem o padding) do contêiner da própria seção, e o texto que vaza
// da própria caixa (scrollWidth > clientWidth com overflow visível).
async function vazamentos(page: Page): Promise<string[]> {
  return page
    .locator('nav, header#inicio, main > section, footer')
    .evaluateAll((areas) =>
      areas.flatMap((area) => {
        const caixa = area.firstElementChild as HTMLElement
        const estilo = getComputedStyle(caixa)
        const limites = caixa.getBoundingClientRect()
        const esquerda = limites.left + parseFloat(estilo.paddingLeft)
        const direita = limites.right - parseFloat(estilo.paddingRight)
        return [...caixa.querySelectorAll<HTMLElement>('*')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            // Até 1 px de largura: o sr-only e o que não tem caixa.
            if (r.width <= 1) return false
            const foraDaCaixa =
              r.left < esquerda - 0.5 || r.right > direita + 0.5
            const textoVazando =
              getComputedStyle(el).overflowX === 'visible' &&
              el.clientWidth > 0 &&
              el.scrollWidth > el.clientWidth + 1
            return foraDaCaixa || textoVazando
          })
          .map(
            (el) =>
              `${area.id || area.tagName.toLowerCase()} <${el.tagName.toLowerCase()}> ${(el.textContent ?? '').trim().slice(0, 40)}`,
          )
      }),
    )
}

test.describe('/', () => {
  test('o h1 e as seções do design, na ordem, sem erro de hidratação', async ({
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
      'Aplicativos, infraestrutura e desenvolvimento fullstack.',
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      H2_DO_CORPO,
    )
    await page.waitForLoadState('networkidle')
    expect(erros).toEqual([])
  })

  // No banner: na Tarefa 6 o botão flutuante também se chama "Falar no WhatsApp".
  test('Falar no WhatsApp e Ver serviços', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const banner = page.getByRole('banner')
    await expect(
      banner.getByRole('link', { name: 'Falar no WhatsApp' }),
    ).toHaveAttribute('href', WHATSAPP.geral)
    await banner.getByRole('link', { name: 'Ver serviços' }).click()
    await expect(page).toHaveURL(/#servicos$/)
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Do primeiro protótipo ao servidor em produção.',
      }),
    ).toBeInViewport()
  })

  // Review Focus 6: o `dark` de cada seção só vale com o @theme inline do globals.css.
  test('cada seção com as cores do design', async ({ page }) => {
    await page.goto('/')
    const noite = rgbDoToken('escuro', 'background')
    const nevoa = rgbDoToken('claro', 'background')
    for (const [secao, esperado] of [
      ['header#inicio', noite],
      ['#servicos', nevoa],
      ['#como-funciona', noite],
      ['#projetos', nevoa],
      ['#tecnologias', noite],
      ['#planos', rgbDoToken('claro', 'primary')],
    ])
      expect([secao, await fundo(page, secao)]).toEqual([secao, esperado])
    expect(
      await page
        .getByRole('heading', { level: 1 })
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe(rgbDoToken('escuro', 'foreground'))
    expect(await fundo(page, 'header#inicio a[href^="https://wa.me/"]')).toBe(
      rgbDoToken('escuro', 'primary'),
    )
  })

  // Review Focus 7: sem o ANEL_DE_FOCO, o anel é 1 px Ciano em volta do botão Ciano.
  test('o foco pelo teclado no "Falar no WhatsApp" do hero mostra o anel Ciano com folga Noite', async ({
    page,
  }) => {
    await page.goto('/')
    const botao = page
      .getByRole('banner')
      .getByRole('link', { name: 'Falar no WhatsApp' })
    for (
      let i = 0;
      i < 20 && !(await botao.evaluate((el) => el === document.activeElement));
      i++
    )
      await page.keyboard.press('Tab')
    await expect(botao).toBeFocused()
    const sombra = await botao.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(sombra).toContain(
      `${rgbDoToken('escuro', 'background')} 0px 0px 0px 2px`,
    )
    expect(sombra).toContain(`${rgbDoToken('escuro', 'ring')} 0px 0px 0px 4px`)
  })

  test('os cartões dos projetos: domínio em aba nova, imagem OG pelo otimizador e o selo do CMS', async ({
    page,
  }) => {
    await page.goto('/')
    for (const projeto of cartoes) {
      const link = page.locator(`a[href="${projeto.url}"]`)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      await expect(link).toContainText(projeto.selo)
      const imagem = link.getByRole('img', { name: projeto.imagem.alt })
      expect(await imagem.getAttribute('src')).toContain(
        `/_next/image?url=${encodeURIComponent(projeto.imagem.src)}&`,
      )
    }
  })

  // Review Focus 3.
  test('com a imagem remota fora do ar, o cartão continua com link, nome, selo e alt', async ({
    page,
  }) => {
    await page.route(/\/_next\/image\?/, (rota) =>
      rota.fulfill({ status: 502, body: '' }),
    )
    await page.goto('/')
    const botai = page.locator(`a[href="${BOTAI.url}"]`)
    await botai.scrollIntoViewIfNeeded()
    await expect(
      botai.getByRole('heading', { level: 3, name: 'Botaí' }),
    ).toBeVisible()
    await expect(botai).toContainText(cartoes[0].selo)
    await expect(
      botai.getByRole('img', { name: BOTAI.imagem.alt }),
    ).toHaveCount(1)
  })

  // No design, os 1180 px são a área de conteúdo, com o gutter por fora (a 1280 px, o texto começa em
  // x = 50). Com os 1180 contando o padding, a coluna do hero estreita e o h1 quebra "desenvolvimento".
  test('a 1280 px, cada seção tem 1180 px de conteúdo e o h1 não parte palavra', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const areas = await page
      .locator('header#inicio, main > section')
      .evaluateAll((secoes) =>
        secoes.map((secao) => {
          const caixa = secao.firstElementChild as HTMLElement
          const estilo = getComputedStyle(caixa)
          const r = caixa.getBoundingClientRect()
          return {
            esquerda: r.left + parseFloat(estilo.paddingLeft),
            largura:
              r.width -
              parseFloat(estilo.paddingLeft) -
              parseFloat(estilo.paddingRight),
          }
        }),
      )
    expect(areas).toHaveLength(6)
    for (const area of areas)
      expect(area).toEqual({ esquerda: 50, largura: 1180 })
    const partidas = await page
      .getByRole('heading', { level: 1 })
      .evaluate((h1) => {
        const texto = h1.firstChild as Text
        return [...texto.data.matchAll(/\S+/g)]
          .filter((palavra) => {
            const faixa = document.createRange()
            faixa.setStart(texto, palavra.index)
            faixa.setEnd(texto, palavra.index + palavra[0].length)
            const linhas = new Set(
              [...faixa.getClientRects()]
                .filter((r) => r.width > 0)
                .map((r) => Math.round(r.top)),
            )
            return linhas.size > 1
          })
          .map((palavra) => palavra[0])
      })
    expect(partidas).toEqual([])
  })

  // O design não define a entrelinha do texto corrido: vale a do navegador (normal), não o 1.5 do preflight.
  test('texto sem entrelinha própria usa a do navegador, como no design', async ({
    page,
  }) => {
    await page.goto('/')
    const entrelinhas = await page
      .locator(
        '#servicos h3, #como-funciona h3, #projetos h3, #planos h3, #planos li li, #tecnologias li',
      )
      .evaluateAll((els) => [
        ...new Set(els.map((el) => getComputedStyle(el).lineHeight)),
      ])
    expect(entrelinhas).toEqual(['normal'])
  })

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

    test('nenhum elemento passa da área de conteúdo da própria seção', async ({
      page,
    }) => {
      await page.goto('/')
      expect(await vazamentos(page)).toEqual([])
    })
  })
})
