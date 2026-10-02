import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { LOJA_UI } from '../../../components/pilulabs/lojas-ui'
import { LOJAS, lojasPublicadas, TIPOS } from '@piluvitu/tools/pilulabs'
import { itensListados, linkDoItem } from '../../../lib/pilulabs'
import { lerItensDoConteudo } from '../../../lib/pilulabs-conteudo'

// O esperado sai do mesmo YAML que as páginas leem: o teste continua valendo
// quando o dono muda o catálogo pelo /admin/pilulabs.
const itens = lerItensDoConteudo(join(__dirname, '..', '..', '..'))
const listados = itensListados(itens)

const ROTULO_DO_GRUPO = {
  extensao: 'Extensões',
  mobile: 'Apps mobile',
  web: 'Apps web',
  cli: 'CLIs',
} as const

function doSlug(slug: string) {
  const item = itens.find((i) => i.slug === slug)
  if (!item) throw new Error(`content/pilulabs/${slug}/index.yaml sumiu`)
  return item
}

async function lerJsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const textos = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  expect(textos.length).toBeGreaterThan(0)
  return textos.map((texto) => JSON.parse(texto) as Record<string, unknown>)
}

// Em dev o metadataBase é http://localhost:3000, e o servidor do teste é a
// 3333: só o caminho da URL serve para pedir a imagem.
async function caminhoDaMeta(page: Page, seletor: string): Promise<string> {
  const conteudo = await page.locator(seletor).first().getAttribute('content')
  expect(conteudo).toBeTruthy()
  const url = new URL(conteudo as string)
  return url.pathname + url.search
}

async function esperarPng(page: Page, caminho: string): Promise<void> {
  const resposta = await page.request.get(caminho)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('image/png')
}

test.describe('/pilulabs', () => {
  test('responde com h1, a linha de terminal e JSON-LD de CollectionPage', async ({
    page,
  }) => {
    const resposta = await page.goto('/pilulabs')
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
    ).toBeVisible()
    await expect(page.locator('main')).toContainText('$ ~/pilulabs')
    const [dados] = await lerJsonLd(page)
    expect(dados['@type']).toBe('CollectionPage')
  })

  test('mostra todos os listados, e só eles, agrupados por tipo na ordem fixa', async ({
    page,
  }) => {
    await page.goto('/pilulabs')
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
    ).toBeVisible()
    await expect(page.getByTestId('pilulabs-vazio')).toHaveCount(
      listados.length === 0 ? 1 : 0,
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      TIPOS.filter((tipo) => listados.some((i) => i.tipo === tipo)).map(
        (tipo) => ROTULO_DO_GRUPO[tipo],
      ),
    )
    for (const item of itens) {
      await expect(
        page.getByRole('heading', { level: 3, name: item.nome, exact: true }),
      ).toHaveCount(item.listado ? 1 : 0)
    }
  })

  test('cada card leva ao link do item', async ({ page }) => {
    await page.goto('/pilulabs')
    for (const item of listados) {
      const href = linkDoItem(item, false)
      if (href) await expect(page.locator(`a[href="${href}"]`)).toHaveCount(1)
    }
  })

  test('o Sombraí abre o próprio site, em aba nova', async ({ page }) => {
    const sombrai = doSlug('sombrai')
    await page.goto('/pilulabs')
    const link = page.locator(`a[href="${sombrai.site}"]`)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toContainText(sombrai.nome)
  })

  test('é indexável e tem og:title e imagens OG próprios', async ({ page }) => {
    await page.goto('/pilulabs')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'PiluLabs | produtos da PiluTech',
    )
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(0)
    const og = await caminhoDaMeta(page, 'meta[property="og:image"]')
    expect(og).toContain('/pilulabs/opengraph-image')
    await esperarPng(page, og)
    const twitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
    expect(twitter).toContain('/pilulabs/twitter-image')
    await esperarPng(page, twitter)
  })
})

test.describe('/pilulabs/botai', () => {
  const botai = doSlug('botai')

  test('responde com h1, o subtítulo e a tabela de atalhos', async ({
    page,
  }) => {
    const resposta = await page.goto('/pilulabs/botai')
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: botai.nome }),
    ).toBeVisible()
    await expect(page.locator('header').first()).toContainText(botai.subtitulo)
    const firefox = page.getByRole('row', { name: /Firefox/ })
    await expect(firefox.getByRole('cell').nth(2)).toHaveText('Alt+Shift+P')
  })

  test('noindex segue o listado do YAML', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      `${botai.nome} | PiluLabs`,
    )
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(botai.listado ? 0 : 1)
  })

  test('botões só das lojas publicadas no YAML', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(
      page.getByRole('heading', { level: 1, name: botai.nome }),
    ).toBeVisible()
    const publicadas = lojasPublicadas(botai)
    for (const loja of LOJAS) {
      const publicada = publicadas.find((l) => l.loja === loja)
      const link = page.getByRole('link', {
        name: LOJA_UI[loja].rotulo,
        exact: true,
      })
      if (publicada) await expect(link).toHaveAttribute('href', publicada.url)
      else await expect(link).toHaveCount(0)
    }
  })

  test('JSON-LD com SoftwareApplication gratuito e a trilha PiluLabs › produto', async ({
    page,
  }) => {
    await page.goto('/pilulabs/botai')
    const [dados] = await lerJsonLd(page)
    const grafo = dados['@graph'] as Record<string, unknown>[]
    const aplicacao = grafo.find((n) => n['@type'] === 'SoftwareApplication')
    expect(aplicacao).toMatchObject({
      name: botai.nome,
      applicationCategory: 'BrowserApplication',
      offers: { price: 0 },
    })
    const urls = lojasPublicadas(botai).map((l) => l.url)
    if (urls.length > 0) expect(aplicacao).toMatchObject({ installUrl: urls })
    else expect(aplicacao).not.toHaveProperty('installUrl')
    expect(grafo.find((n) => n['@type'] === 'BreadcrumbList')).toBeTruthy()
  })

  test('liga para a política de privacidade', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(
      page.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/pilulabs/botai/privacidade')
  })

  test('imagens OG do próprio segmento', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    const og = await caminhoDaMeta(page, 'meta[property="og:image"]')
    expect(og).toContain('/pilulabs/botai/opengraph-image')
    await esperarPng(page, og)
    const twitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
    expect(twitter).toContain('/pilulabs/botai/twitter-image')
    await esperarPng(page, twitter)
  })
})

test.describe('/pilulabs/botai/privacidade', () => {
  const botai = doSlug('botai')

  test('responde com h1, data, contato e a tabela de permissões', async ({
    page,
  }) => {
    const resposta = await page.goto('/pilulabs/botai/privacidade')
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: `Política de privacidade do ${botai.nome}`,
      }),
    ).toBeVisible()
    await expect(page.locator('time[datetime="2026-10-01"]')).toBeVisible()
    await expect(
      page.locator('a[href="mailto:pilutechinformatica@gmail.com"]').first(),
    ).toBeVisible()
    await expect(page.getByRole('row', { name: /^menus\b/ })).toContainText(
      'Só no Firefox',
    )
  })

  test('noindex igual ao da página do produto', async ({ page }) => {
    await page.goto('/pilulabs/botai/privacidade')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      `Política de privacidade do ${botai.nome} | PiluLabs`,
    )
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(botai.listado ? 0 : 1)
  })

  test('a página do produto leva até aqui', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await page.getByRole('link', { name: 'Política de privacidade' }).click()
    await expect(page).toHaveURL('/pilulabs/botai/privacidade')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Política de privacidade',
    )
  })

  test('JSON-LD com a trilha PiluLabs › produto › política', async ({
    page,
  }) => {
    await page.goto('/pilulabs/botai/privacidade')
    const [dados] = await lerJsonLd(page)
    expect(dados['@type']).toBe('BreadcrumbList')
    const passos = dados.itemListElement as { name: string }[]
    expect(passos.map((i) => i.name)).toEqual([
      'PiluLabs',
      botai.nome,
      'Política de privacidade',
    ])
  })

  // A política é filha da página do produto e declara openGraph: sem arquivo
  // próprio, ela perderia a imagem (mesclagem do Next 16).
  test('imagens OG do próprio segmento', async ({ page }) => {
    await page.goto('/pilulabs/botai/privacidade')
    const og = await caminhoDaMeta(page, 'meta[property="og:image"]')
    expect(og).toContain('/pilulabs/botai/privacidade/opengraph-image')
    await esperarPng(page, og)
    const twitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
    expect(twitter).toContain('/pilulabs/botai/privacidade/twitter-image')
    await esperarPng(page, twitter)
  })
})

// A política é o link que vai para as lojas, e o revisor abre no celular também.
// Uma URL longa em <code> (a caixa do tuamaeaquelaursa.com) não quebrava e
// empurrava a página 16 px para fora da tela a 375 px.
test.describe('cabe na largura de um celular, sem rolagem horizontal', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  for (const rota of [
    '/pilulabs',
    '/pilulabs/botai',
    '/pilulabs/botai/privacidade',
  ]) {
    test(rota, async ({ page }) => {
      await page.goto(rota)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })
  }
})
