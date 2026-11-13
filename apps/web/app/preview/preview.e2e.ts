import { expect, test, type APIResponse } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Achado de 2026-11-12, reproduzido num build de produção local: um GET anônimo no
// /preview/start ligava o draft mode (__prerender_bypass) e gravava o ks-branch, e a home e
// /posts/<slug> passavam a mostrar os rascunhos do blog privado. Sem GitHub real aqui: o caminho
// de quem é admin fica no Jest (route.test.ts), com o GitHub injetado.

function setCookies(res: APIResponse) {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
}

/** O id que o `next start` aceita no `__prerender_bypass`, lido do build que ele serve. */
function previewModeIdDoBuild(): string | null {
  try {
    const manifesto = JSON.parse(
      readFileSync(
        join(process.cwd(), '.next', 'prerender-manifest.json'),
        'utf8',
      ),
    ) as { preview?: { previewModeId?: unknown } }
    const id = manifesto.preview?.previewModeId
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

test.describe('preview do conteúdo exige admin', () => {
  test('GET anônimo em /preview/start leva 401 e nenhum Set-Cookie', async ({
    request,
  }) => {
    const res = await request.get('/preview/start?to=/&branch=main', {
      maxRedirects: 0,
    })
    expect(res.status()).toBe(401)
    expect(setCookies(res)).toEqual([])
  })

  test('cookie do GitHub forjado também leva 401 e nenhum Set-Cookie', async ({
    request,
  }) => {
    const res = await request.get('/preview/start?to=/&branch=main', {
      maxRedirects: 0,
      headers: { cookie: 'piluvitu_admin_gh=forjado' },
    })
    expect(res.status()).toBe(401)
    expect(setCookies(res)).toEqual([])
  })

  // Desligar não exige admin (só apaga os cookies de quem pede); a checagem de Origin segue.
  test('POST sem admin em /preview/end apaga os cookies do preview e volta para o Referer', async ({
    request,
    baseURL,
  }) => {
    const origem = new URL(baseURL!).origin
    const res = await request.post('/preview/end', {
      maxRedirects: 0,
      headers: { origin: origem, referer: `${origem}/privacidade` },
    })
    expect(res.status()).toBe(303)
    expect(res.headers()['location']).toBe(`${origem}/privacidade`)
    const apagados = setCookies(res)
      .filter((c) => /Expires=Thu, 01 Jan 1970/.test(c))
      .map((c) => c.split('=')[0])
    expect(apagados).toEqual(
      expect.arrayContaining([
        '__prerender_bypass',
        'piluvitu_preview',
        'ks-branch',
      ]),
    )
  })

  test('POST de outra origem em /preview/end leva 400 e nenhum Set-Cookie', async ({
    request,
    baseURL,
  }) => {
    const origem = new URL(baseURL!).origin
    const res = await request.post('/preview/end', {
      maxRedirects: 0,
      headers: {
        origin: 'https://evil.example',
        referer: `${origem}/privacidade`,
      },
    })
    expect(res.status()).toBe(400)
    expect(setCookies(res)).toEqual([])
  })

  // Um `__prerender_bypass` qualquer nem liga o draft mode no build de produção; o caso real é o id
  // verdadeiro do build sem um selado válido (revisão de 2026-11-12, mutação "previewAtivo só
  // confia no draft mode").
  test('o __prerender_bypass verdadeiro, sem selado válido, não liga a pré-visualização', async ({
    page,
    context,
    baseURL,
  }) => {
    const previewModeId = previewModeIdDoBuild()
    test.skip(
      !process.env.E2E_BASE_URL || !previewModeId,
      'precisa do next start de um build local (E2E_BASE_URL) e do .next/prerender-manifest.json dele',
    )
    await context.addCookies(
      [
        ['__prerender_bypass', previewModeId!],
        ['ks-branch', 'main'],
        ['piluvitu_preview', randomBytes(80).toString('base64url')],
      ].map(([name, value]) => ({ name, value, url: baseURL! })),
    )

    const res = await page.goto('/privacidade')

    // Controle: o draft mode do Next ligou de fato, e a página estática deixou de sair do cache.
    expect(res?.headers()['cache-control']).toContain('no-store')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Pré-visualização')).toHaveCount(0)
  })
})
