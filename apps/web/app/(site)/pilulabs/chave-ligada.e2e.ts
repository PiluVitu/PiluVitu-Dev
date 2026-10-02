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

test.describe('chave PILUTECH_SUBDOMINIOS ligada', () => {
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
