import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import {
  itemParaProject,
  itensListados,
  linkDoItem,
  selecionarParaHome,
} from '../../../lib/pilulabs'
import { lerItensDoConteudo } from '../../../lib/pilulabs-conteudo'
import { subdominiosAtivos } from '../../../lib/pilutech-dominios'

// As páginas só mudam com a chave ligada no servidor, e o Playwright repassa o
// próprio ambiente ao `pnpm dev`. Rode à parte, com o servidor do teste:
//   PILUTECH_SUBDOMINIOS=1 CI=1 ./node_modules/.bin/playwright test --retries=0 pilulabs/chave-ligada
// Nas outras execuções, o arquivo inteiro sai como skipped.
test.skip(!subdominiosAtivos(), 'só com PILUTECH_SUBDOMINIOS=1')

const url = (host: string, caminho = '/') => `http://${host}:3333${caminho}`
// A metadata declara https://<host>/, mas o Next 16.3.8 serializa a URL
// absoluta de caminho "/" como a origem, sem a barra
// (resolveAbsoluteUrlWithPathname, em lib/metadata/resolvers/resolve-url.js).
const canonicalDaRaiz = (host: string) => `https://${host}`
const itens = lerItensDoConteudo(join(__dirname, '..', '..', '..'))

function doSlug(slug: string) {
  const item = itens.find((i) => i.slug === slug)
  if (!item) throw new Error(`content/pilulabs/${slug}/index.yaml sumiu`)
  return item
}

const botai = doSlug('botai')

test.describe('chave PILUTECH_SUBDOMINIOS ligada', () => {
  test('no host de sempre, /pilulabs/botai responde 308 para o subdomínio, com a query', async ({
    page,
  }) => {
    const resposta = await page.request.get('/pilulabs/botai?x=1', {
      maxRedirects: 0,
    })
    expect(resposta.status()).toBe(308)
    expect(resposta.headers()['location']).toBe(
      'https://botai.pilutech.com.br/?x=1',
    )
  })

  // Um href="/pilulabs" literal esquecido passaria no tsc e em todo o resto.
  test('a página do Botaí no subdomínio: canonical, siteName e links nos hosts PiluTech', async ({
    page,
  }) => {
    await page.goto(url('botai.pilutech.localhost'))
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      canonicalDaRaiz('botai.pilutech.com.br'),
    )
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      'pilutech.com.br',
    )
    await expect(
      page.getByRole('link', { name: 'PiluLabs', exact: true }),
    ).toHaveAttribute('href', 'https://pilutech.com.br/')
    await expect(
      page.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', 'https://botai.pilutech.com.br/privacidade')
    await expect(
      page.getByRole('link', { name: 'Powered by PiluTech', exact: true }),
    ).toHaveAttribute('href', 'https://pilutech.com.br/')
  })

  test('a política no subdomínio: canonical e o voltar para a página do Botaí', async ({
    page,
  }) => {
    await page.goto(url('botai.pilutech.localhost', '/privacidade'))
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://botai.pilutech.com.br/privacidade',
    )
    await expect(
      page.getByRole('link', { name: botai.nome, exact: true }),
    ).toHaveAttribute('href', 'https://botai.pilutech.com.br/')
  })

  test('a vitrine em pilutech.localhost: canonical, cards no link público e o autor absoluto', async ({
    page,
  }) => {
    await page.goto(url('pilutech.localhost'))
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      canonicalDaRaiz('pilutech.com.br'),
    )
    for (const item of itensListados(itens)) {
      const href = linkDoItem(item, true)
      if (href) await expect(page.locator(`a[href="${href}"]`)).toHaveCount(1)
    }
    // "/" no host PiluTech é a própria vitrine: o voltar tem de sair dele.
    await expect(
      page.getByRole('link', { name: 'Paulo Victor', exact: true }),
    ).toHaveAttribute('href', /^https?:\/\//)
  })

  test('a home: Saiba mais, rodapé e Acessar nos hosts PiluTech', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(
      page.getByRole('link', { name: 'Saiba mais no PiluLabs' }),
    ).toHaveAttribute('href', 'https://pilutech.com.br/')
    await expect(
      page.getByRole('link', { name: '/pilulabs', exact: true }),
    ).toHaveAttribute('href', 'https://pilutech.com.br/')
    const hrefs = await page
      .locator('section[aria-labelledby="pilulabs-heading"]')
      .getByRole('link', { name: 'Acessar', exact: true })
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')))
    expect(hrefs).toEqual(
      selecionarParaHome(itens)
        .map((item) => itemParaProject(item, true).deployLink)
        .filter(Boolean),
    )
  })
})
