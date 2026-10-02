import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { lerItensDoConteudo } from '../../../lib/pilulabs-conteudo'

// O Chromium e o Node resolvem *.localhost para o loopback, e o next dev já
// aceita **.localhost: o mesmo servidor da 3333 responde como pilutech.localhost.
const url = (host: string, caminho = '/') => `http://${host}:3333${caminho}`

function itemBotai() {
  const item = lerItensDoConteudo(join(__dirname, '..', '..', '..')).find(
    (i) => i.slug === 'botai',
  )
  if (!item) throw new Error('content/pilulabs/botai/index.yaml sumiu')
  return item
}

const botai = itemBotai()

test.describe('subdomínios PiluTech, local em pilutech.localhost', () => {
  for (const host of ['pilutech.localhost', 'www.pilutech.localhost']) {
    test(`${host}/ é a vitrine, sem mudar a URL`, async ({ page }) => {
      const resposta = await page.goto(url(host))
      expect(resposta?.status()).toBe(200)
      await expect(
        page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
      ).toBeVisible()
      expect(page.url()).toBe(url(host))
    })
  }

  test('botai.pilutech.localhost/ é a página do Botaí', async ({ page }) => {
    const resposta = await page.goto(url('botai.pilutech.localhost'))
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: botai.nome }),
    ).toBeVisible()
  })

  test('botai.pilutech.localhost/privacidade é a política', async ({
    page,
  }) => {
    const resposta = await page.goto(
      url('botai.pilutech.localhost', '/privacidade'),
    )
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: `Política de privacidade do ${botai.nome}`,
      }),
    ).toBeVisible()
  })

  // Um arquivo da raiz, que o navegador busca em todo subdomínio. Um caminho
  // em /pilulabs/… não provaria nada: ele já passa por começar com /pilulabs.
  test('os arquivos saem no subdomínio sem reescrita', async ({ page }) => {
    const resposta = await page.request.get(
      url('botai.pilutech.localhost', '/favicon.ico'),
    )
    expect(resposta.status()).toBe(200)
    expect(resposta.headers()['content-type']).toContain('image/x-icon')
  })

  test('a página do subdomínio carrega os chunks do /_next sem erro', async ({
    page,
  }) => {
    const falhas: string[] = []
    page.on('response', (resposta) => {
      if (resposta.url().includes('/_next/') && resposta.status() >= 400)
        falhas.push(`${resposta.status()} ${resposta.url()}`)
    })
    await page.goto(url('botai.pilutech.localhost'), { waitUntil: 'load' })
    await expect(
      page.getByRole('heading', { level: 1, name: botai.nome }),
    ).toBeVisible()
    expect(falhas).toEqual([])
  })

  // Este arquivo roda com a chave desligada (a ligada é o chave-ligada.e2e.ts):
  // o host de sempre não pode redirecionar.
  test('no host de sempre, /pilulabs responde 200, sem 308', async ({
    page,
  }) => {
    const resposta = await page.request.get('/pilulabs', { maxRedirects: 0 })
    expect(resposta.status()).toBe(200)
  })
})
