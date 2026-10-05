import { expect, test, type Page } from '@playwright/test'
import { lerFaseDoBotai } from '../lib/cms'
import {
  BOTAI,
  cartoesDosProjetos,
  DUVIDAS,
  SECOES_DA_BARRA,
} from '../lib/conteudo'
import { EMAIL_DA_PILUTECH, MAILTO_DO_SITE, WHATSAPP } from '../lib/contato'
import { rgbDoToken } from '../lib/tokens-do-ds'

// O esperado sai do mesmo YAML que a página lê no build.
const cartoes = cartoesDosProjetos(lerFaseDoBotai())

const fundo = (page: Page, seletor: string) =>
  page.locator(seletor).evaluate((el) => getComputedStyle(el).backgroundColor)
const corDoTexto = (page: Page, seletor: string) =>
  page.locator(seletor).evaluate((el) => getComputedStyle(el).color)

const H2_DA_PAGINA = [
  'Do primeiro protótipo ao servidor em produção.',
  'Quatro etapas, com escopo e valor por escrito.',
  'Produtos próprios da PiluTech.',
  'Ferramentas usadas no dia a dia.',
  'Seu aplicativo atualizado, monitorado e no ar.',
  'Dúvidas comuns',
  'Conte o que você precisa.',
]

const barra = (page: Page) =>
  page.getByRole('navigation', { name: 'Principal' })

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

// A caixa de cada cartão é o item da grade que contém o h3 dele.
const caixasDaGrade = (page: Page, secao: string) =>
  page.locator(`#${secao} h3`).evaluateAll((titulos) =>
    titulos.map((h3) => {
      let item = h3 as HTMLElement
      while (
        getComputedStyle(item.parentElement as HTMLElement).display !== 'grid'
      )
        item = item.parentElement as HTMLElement
      const r = item.getBoundingClientRect()
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        largura: Math.round(r.width),
      }
    }),
  )

const GRADES_2X2 = [
  { secao: 'servicos', cartoes: 'serviços' },
  { secao: 'tecnologias', cartoes: 'grupos de tecnologia' },
  { secao: 'planos', cartoes: 'planos' },
]

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
      'Infraestrutura, IA e desenvolvimento de software.',
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      H2_DA_PAGINA,
    )
    await page.waitForLoadState('networkidle')
    expect(erros).toEqual([])
  })

  // No banner: o botão flutuante também se chama "Falar no WhatsApp".
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
      ['#duvidas', nevoa],
      ['#contato', noite],
      ['footer', noite],
      ['a[aria-label="Falar no WhatsApp"]', rgbDoToken('escuro', 'primary')],
      [
        'header#inicio a[href^="https://wa.me/"]',
        rgbDoToken('escuro', 'primary'),
      ],
    ])
      expect([secao, await fundo(page, secao)]).toEqual([secao, esperado])
    // O fundo da barra tem 94% de opacidade (o Chromium devolve oklab): confere o texto.
    expect(await corDoTexto(page, 'nav')).toBe(
      rgbDoToken('escuro', 'foreground'),
    )
    expect(await corDoTexto(page, 'h1')).toBe(
      rgbDoToken('escuro', 'foreground'),
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

  test.describe('barra fixa', () => {
    for (const largura of [900, 1280]) {
      test(`a ${largura} px: os 5 links visíveis, sem rolagem horizontal na barra`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: largura, height: 800 })
        await page.goto('/')
        for (const secao of SECOES_DA_BARRA)
          await expect(
            barra(page).getByRole('link', { name: secao.rotulo, exact: true }),
          ).toBeVisible()
        const medida = await barra(page).evaluate((nav) => {
          const caixa = nav.firstElementChild as HTMLElement
          return {
            caixa: caixa.scrollWidth - caixa.clientWidth,
            nav: nav.scrollWidth - nav.clientWidth,
          }
        })
        expect(medida).toEqual({ caixa: 0, nav: 0 })
      })
    }

    test('a 899 px os links somem e ficam o símbolo e o WhatsApp', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 899, height: 800 })
      await page.goto('/')
      await expect(
        barra(page).getByRole('link', { name: 'Serviços', exact: true }),
      ).toBeHidden()
      await expect(
        barra(page).getByRole('link', { name: 'PiluTech' }),
      ).toBeVisible()
      await expect(
        barra(page).getByRole('link', { name: 'WhatsApp' }),
      ).toBeVisible()
    })

    // Review Focus 4: é CSS, então vale antes da hidratação e sem JavaScript.
    test('sem JavaScript, a mesma regra dos 900 px', async ({ browser }) => {
      for (const [largura, visivel] of [
        [899, false],
        [900, true],
      ] as const) {
        const contexto = await browser.newContext({
          javaScriptEnabled: false,
          viewport: { width: largura, height: 800 },
        })
        const page = await contexto.newPage()
        await page.goto('/')
        const link = barra(page).getByRole('link', {
          name: 'Serviços',
          exact: true,
        })
        if (visivel) await expect(link).toBeVisible()
        else await expect(link).toBeHidden()
        await contexto.close()
      }
    })

    test('fica no topo ao rolar', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
      await expect(barra(page)).toBeInViewport()
      expect((await barra(page).boundingBox())?.y).toBe(0)
    })

    for (const secao of SECOES_DA_BARRA) {
      test(`${secao.rotulo} leva à seção, sem a barra cobrir o começo dela`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')
        await barra(page)
          .getByRole('link', { name: secao.rotulo, exact: true })
          .click()
        await expect(page).toHaveURL(new RegExp(`#${secao.id}$`))
        await expect(
          page.locator(`#${secao.id}`).getByRole('heading', { level: 2 }),
        ).toBeInViewport()
        await expect
          .poll(
            async () => (await page.locator(`#${secao.id}`).boundingBox())?.y,
          )
          .toBeGreaterThanOrEqual(68)
      })
    }
  })

  test('todo link externo abre em aba nova, sem passar a referência', async ({
    page,
  }) => {
    await page.goto('/')
    const externos = await page.locator('a[href^="http"]').all()
    expect(externos.length).toBeGreaterThan(0)
    for (const link of externos) {
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  test('o WhatsApp: a conversa geral na barra, no hero, no contato e no botão flutuante, e uma por plano', async ({
    page,
  }) => {
    await page.goto('/')
    const hrefs = await page
      .locator('a[href^="https://wa.me/"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')))
    expect(hrefs.filter((h) => h === WHATSAPP.geral)).toHaveLength(4)
    expect(hrefs.filter((h) => h !== WHATSAPP.geral)).toEqual([
      WHATSAPP.infraestrutura,
      WHATSAPP.ia,
      WHATSAPP.essencial,
      WHATSAPP.evolucao,
    ])
  })

  test('o botão flutuante tem nome e continua na tela ao rolar', async ({
    page,
  }) => {
    await page.goto('/')
    const flutuante = page.locator('a[aria-label="Falar no WhatsApp"]')
    await expect(flutuante).toHaveAttribute('href', WHATSAPP.geral)
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
    await expect(flutuante).toBeInViewport()
  })

  test('o e-mail vai para a PiluTech com [PiluTech] no assunto', async ({
    page,
  }) => {
    await page.goto('/')
    const email = page.getByRole('link', {
      name: `E-mail ${EMAIL_DA_PILUTECH}`,
    })
    await expect(email).toHaveAttribute('href', MAILTO_DO_SITE)
    expect(
      new URL((await email.getAttribute('href')) as string).searchParams.get(
        'subject',
      ),
    ).toBe('[PiluTech] Contato pelo site')
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
  // As Dúvidas seguem a mesma regra com 860 px: a 1280 px, o texto começa em x = (1280 − 860) / 2 = 210.
  test('a 1280 px, cada seção tem 1180 px de conteúdo (860 nas dúvidas) e o h1 não parte palavra', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const areas = await page
      .locator('nav, header#inicio, main > section, footer')
      .evaluateAll((secoes) =>
        secoes.map((secao) => {
          const caixa = secao.firstElementChild as HTMLElement
          const estilo = getComputedStyle(caixa)
          const r = caixa.getBoundingClientRect()
          return {
            secao: secao.id || secao.tagName.toLowerCase(),
            esquerda: r.left + parseFloat(estilo.paddingLeft),
            largura:
              r.width -
              parseFloat(estilo.paddingLeft) -
              parseFloat(estilo.paddingRight),
          }
        }),
      )
    const larga = { esquerda: 50, largura: 1180 }
    expect(areas).toEqual([
      { secao: 'nav', ...larga },
      { secao: 'inicio', ...larga },
      { secao: 'servicos', ...larga },
      { secao: 'como-funciona', ...larga },
      { secao: 'projetos', ...larga },
      { secao: 'tecnologias', ...larga },
      { secao: 'planos', ...larga },
      { secao: 'duvidas', esquerda: 210, largura: 860 },
      { secao: 'contato', ...larga },
      { secao: 'footer', ...larga },
    ])
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

  // Com 4 cartões, a grade de 3 colunas deixava o quarto sozinho na segunda linha.
  for (const { secao, cartoes: nome } of GRADES_2X2) {
    test(`a 1280 px, os 4 ${nome} em 2×2, com a mesma largura`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto('/')
      const cartoes = await caixasDaGrade(page, secao)
      expect(cartoes.map(({ x, largura }) => ({ x, largura }))).toEqual([
        { x: 50, largura: 580 },
        { x: 650, largura: 580 },
        { x: 50, largura: 580 },
        { x: 650, largura: 580 },
      ])
      expect(cartoes[0].y).toBe(cartoes[1].y)
      expect(cartoes[2].y).toBe(cartoes[3].y)
      expect(cartoes[2].y).toBeGreaterThan(cartoes[0].y)
    })

    test(`a 390 px, os 4 ${nome} numa coluna, sem rolagem horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/')
      const cartoes = await caixasDaGrade(page, secao)
      expect(cartoes.map(({ x, largura }) => ({ x, largura }))).toEqual(
        Array(4).fill({ x: 20, largura: 350 }),
      )
      for (let i = 1; i < cartoes.length; i++)
        expect(cartoes[i].y).toBeGreaterThan(cartoes[i - 1].y)
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
      expect(await vazamentos(page)).toEqual([])
    })
  }

  test('planos, tecnologias e dúvidas: a contagem e a ordem, IA logo depois de infraestrutura', async ({
    page,
  }) => {
    await page.goto('/')
    for (const [secao, contagem] of [
      ['planos', '04'],
      ['tecnologias', '04'],
      ['duvidas', '08'],
    ])
      await expect(
        page.locator(`#${secao}`).getByText(contagem, { exact: true }),
      ).toBeVisible()
    await expect(page.locator('#planos h3')).toHaveText([
      'Infraestrutura',
      'IA',
      'Essencial',
      'Evolução',
    ])
    await expect(page.locator('#tecnologias h3')).toHaveText([
      'Infraestrutura',
      'IA',
      'Back-end',
      'Front-end',
    ])
    await expect(
      page
        .locator('#tecnologias')
        .getByRole('list', { name: 'IA' })
        .getByRole('listitem'),
    ).toHaveText([
      'OpenAI',
      'Claude',
      'Ollama',
      'Whisper',
      'MLX',
      'RAG',
      'Fine-tuning',
    ])
    const perguntas = page.locator('#duvidas').getByRole('button')
    await expect(perguntas).toHaveCount(8)
    for (const [indice, pergunta] of [
      'Quanto custa um aplicativo?',
      'Você assume um aplicativo que outra pessoa fez?',
      'Como funciona o orçamento de infraestrutura?',
      'Meus dados ficam seguros com IA?',
      'Quanto custa usar IA no dia a dia?',
      'Como funciona o treino de um modelo com os dados da empresa?',
      'O atendimento é só em Teresina?',
      'A PiluTech ainda faz manutenção de computadores e impressoras?',
    ].entries())
      await expect(perguntas.nth(indice)).toHaveAccessibleName(pergunta)
  })

  test('o "Pedir proposta" do plano de IA abre o WhatsApp com a mensagem dele, em aba nova', async ({
    page,
  }) => {
    await page.goto('/')
    const link = page
      .locator('#planos')
      .getByRole('link', { name: 'Pedir proposta do plano IA' })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const url = new URL((await link.getAttribute('href')) as string)
    expect(`${url.origin}${url.pathname}`).toBe('https://wa.me/5586981737625')
    expect(url.searchParams.get('text')).toBe(
      'Olá! Quero uma proposta do plano de IA.',
    )
  })

  // O design não define a entrelinha do texto corrido: vale a do navegador (normal), não o 1.5 do preflight.
  test('texto sem entrelinha própria usa a do navegador, como no design', async ({
    page,
  }) => {
    await page.goto('/')
    const entrelinhas = await page
      .locator(
        '#servicos h3, #como-funciona h3, #projetos h3, #planos h3, #planos li li, #tecnologias li, #duvidas h3 button, nav li, footer p',
      )
      .evaluateAll((els) => [
        ...new Set(els.map((el) => getComputedStyle(el).lineHeight)),
      ])
    expect(entrelinhas).toEqual(['normal'])
  })

  // O → (U+2192) fica fora do subset latin da JetBrains Mono. No design ele cai na mono do sistema, com a
  // largura de uma célula (~0,6em); o fallback automático do next/font é o Arial com size-adjust de 134,59%,
  // que desenhava a seta com 1,35em, mais que o dobro.
  test('as setas dos serviços e dos projetos têm a largura de uma célula mono, como no design', async ({
    page,
  }) => {
    await page.goto('/')
    const larguras = await page
      .locator(
        '#servicos li li > span[aria-hidden], #projetos a span[aria-hidden]',
      )
      .evaluateAll((els) =>
        els.map((el) => ({
          seta: el.textContent?.trim(),
          largura:
            el.getBoundingClientRect().width /
            parseFloat(getComputedStyle(el).fontSize),
        })),
      )
    expect(larguras).toHaveLength(14)
    for (const { seta, largura } of larguras) {
      expect(seta).toBe('→')
      expect(largura).toBeLessThan(0.75)
    }
  })

  test('dúvidas: abre e fecha pelo teclado, uma por vez', async ({ page }) => {
    await page.goto('/')
    const perguntas = page.locator('#duvidas').getByRole('button')
    await expect(perguntas).toHaveCount(8)
    await expect(perguntas.nth(0)).toHaveAttribute('aria-expanded', 'true')
    await perguntas.nth(1).focus()
    await page.keyboard.press('Enter')
    await expect(perguntas.nth(1)).toHaveAttribute('aria-expanded', 'true')
    await expect(perguntas.nth(0)).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText(DUVIDAS[1].resposta)).toBeVisible()
    await expect(page.getByText(DUVIDAS[0].resposta)).toBeHidden()
    await page.keyboard.press('Tab')
    await expect(perguntas.nth(2)).toBeFocused()
    await page.keyboard.press('Space')
    await expect(perguntas.nth(2)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(perguntas.nth(2)).toHaveAttribute('aria-expanded', 'false')
  })

  // Review Focus 4.
  test('dúvidas sem JavaScript: as 8 respostas no HTML, a primeira aberta', async ({
    browser,
  }) => {
    const contexto = await browser.newContext({ javaScriptEnabled: false })
    const page = await contexto.newPage()
    await page.goto('/')
    const html = await page.content()
    expect(DUVIDAS).toHaveLength(8)
    for (const duvida of DUVIDAS) expect(html).toContain(duvida.resposta)
    await expect(page.getByText(DUVIDAS[0].resposta)).toBeVisible()
    for (const duvida of DUVIDAS.slice(1))
      await expect(page.getByText(duvida.resposta)).toBeHidden()
    await contexto.close()
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
