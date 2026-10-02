import { expect, test } from '@playwright/test'

// O Chromium e o Node resolvem *.localhost para o loopback, e o next dev já
// aceita **.localhost: o mesmo servidor da 3333 responde como pilutech.localhost.
const url = (host: string, caminho = '/') => `http://${host}:3333${caminho}`

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

  // Um arquivo da raiz, que o navegador busca em todo host PiluTech. Um caminho
  // em /pilulabs/… não provaria nada: ele já passa por começar com /pilulabs.
  test('os arquivos saem no host PiluTech sem reescrita nem 308', async ({
    page,
  }) => {
    const resposta = await page.request.get(
      url('pilutech.localhost', '/favicon.ico'),
      { maxRedirects: 0 },
    )
    expect(resposta.status()).toBe(200)
    expect(resposta.headers()['content-type']).toContain('image/x-icon')
  })

  test('a vitrine no host PiluTech carrega os chunks do /_next sem erro', async ({
    page,
  }) => {
    const falhas: string[] = []
    page.on('response', (resposta) => {
      if (resposta.url().includes('/_next/') && resposta.status() >= 400)
        falhas.push(`${resposta.status()} ${resposta.url()}`)
    })
    await page.goto(url('pilutech.localhost'), { waitUntil: 'load' })
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
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
