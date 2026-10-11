import { expect, test } from '@playwright/test'

// Fora da produção da Vercel (este E2E roda no next dev, sem VERCEL_ENV), nenhuma página pode carregar
// o Web Analytics nem o Speed Insights: nem as rotas do próprio domínio nem os scripts de depuração
// que os dois puxam de va.vercel-scripts.com fora da produção.
function ehDaVercel(url: string): boolean {
  const { hostname, pathname } = new URL(url)
  return (
    pathname.startsWith('/_vercel/') || hostname.endsWith('vercel-scripts.com')
  )
}

for (const caminho of ['/', '/tools', '/pilulabs', '/privacidade'])
  test(`${caminho} não carrega a medição da Vercel fora da produção`, async ({
    page,
  }) => {
    const daVercel: string[] = []
    page.on('request', (pedido) => {
      if (ehDaVercel(pedido.url())) daVercel.push(pedido.url())
    })
    await page.goto(caminho)
    await page.waitForLoadState('networkidle')
    expect(daVercel).toEqual([])
  })
