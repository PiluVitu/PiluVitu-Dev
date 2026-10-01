import { expect, test } from './fixtures'

async function ativa(sw: import('@playwright/test').Worker) {
  return sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    })
    return { id: t.id!, url: t.url ?? null }
  })
}
async function tentar(sw: import('@playwright/test').Worker, id: number) {
  return sw.evaluate(async (tabId) => {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => 1 })
      return 'NO_ERROR'
    } catch (e) {
      return String(e)
    }
  }, id)
}

test('build de produção (só activeTab): sem gesto, executeScript é recusado e tab.url fica oculta', async ({
  context,
  sw,
}) => {
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4599/form.html')
  await page.bringToFront()
  const t = await ativa(sw)
  console.log('TAB_URL_SEM_GRANT', t.url)
  const err = await tentar(sw, t.id)
  console.log('NO_HOST_PERMISSION_ERROR', err)
  expect(err).not.toBe('NO_ERROR')

  const restrita = await context.newPage()
  await restrita.goto('chrome://version')
  await restrita.bringToFront()
  const r = await ativa(sw)
  console.log('CHROME_URL_ERROR', await tentar(sw, r.id))
})
