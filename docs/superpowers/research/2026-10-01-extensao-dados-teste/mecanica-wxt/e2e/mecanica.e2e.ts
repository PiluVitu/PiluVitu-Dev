import { expect, test } from './fixtures'

const EXTRA = 'http://127.0.0.1:4599/extra.html'

async function idAtiva(sw: import('@playwright/test').Worker) {
  return sw.evaluate(
    async () =>
      (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
        .id!,
  )
}
const alvo = () => {
  let el: Element | null = document.activeElement
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
  return el
    ? `${el.tagName.toLowerCase()}${(el as HTMLInputElement).name ? '[name=' + (el as HTMLInputElement).name + ']' : ''}${el.id ? '#' + el.id : ''}`
    : null
}

test('botão direito: textarea, contenteditable e input em shadow root aberto', async ({
  context,
  sw,
}) => {
  const page = await context.newPage()
  await page.goto(EXTRA)
  await page.bringToFront()
  const tabId = await idAtiva(sw)
  const out: Record<string, unknown> = {}
  for (const [rotulo, loc] of [
    ['textarea', page.locator('textarea')],
    ['contenteditable', page.locator('#ce')],
    ['shadow', page.locator('my-field input')],
  ] as const) {
    await loc.click({ button: 'right' })
    const [r] = await sw.evaluate(
      async ([id, fn]) =>
        chrome.scripting.executeScript({
          target: { tabId: id, frameIds: [0] },
          func: new Function(`return (${fn})()`) as () => string,
        }),
      [tabId, alvo.toString()] as const,
    )
    out[rotulo] = r.result
  }
  console.log('RIGHT_CLICK_TARGETS', JSON.stringify(out))
})

test('allFrames: iframe da mesma origem entra, de outra origem fica de fora (sem host permission)', async ({
  context,
  sw,
}) => {
  const page = await context.newPage()
  await page.goto(EXTRA)
  await page.waitForLoadState('load')
  await page.bringToFront()
  const tabId = await idAtiva(sw)
  const res = await sw.evaluate(async (id) => {
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId: id, allFrames: true },
        func: () => location.href,
      })
      return r.map((x) => ({
        frameId: x.frameId,
        result: x.result,
        error: (x as { error?: unknown }).error,
      }))
    } catch (e) {
      return String(e)
    }
  }, tabId)
  console.log('ALL_FRAMES', JSON.stringify(res))
  const frames = await sw.evaluate(
    async (id) =>
      (await chrome.webNavigation?.getAllFrames({ tabId: id })) ??
      'no webNavigation permission',
    tabId,
  )
  console.log('FRAMES_INFO', JSON.stringify(frames))
})

test('tabs.create abre chrome://extensions/shortcuts', async ({
  context,
  sw,
}) => {
  const waiting = context.waitForEvent('page')
  const err = await sw.evaluate(async () => {
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
      return 'ok'
    } catch (e) {
      return String(e)
    }
  })
  const p = await waiting
  await p.waitForLoadState()
  console.log('SHORTCUTS_TAB', err, p.url())
  expect(p.url()).toContain('chrome://extensions/shortcuts')
})

test('popup aberto como aba: tabs.query ativo devolve a própria aba do popup', async ({
  context,
  extensionId,
  sw,
}) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const url = await popup.evaluate(
    async () =>
      (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url,
  )
  console.log('POPUP_AS_TAB_ACTIVE_URL', url)
})
