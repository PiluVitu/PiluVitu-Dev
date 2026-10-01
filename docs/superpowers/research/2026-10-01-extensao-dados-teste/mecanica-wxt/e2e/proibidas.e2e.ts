import { test } from './fixtures'

for (const url of [
  'https://chromewebstore.google.com/',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
]) {
  test(`erro de executeScript em ${url}`, async ({ context, sw }) => {
    const page = await context.newPage()
    try {
      await page.goto(url, { timeout: 20000 })
    } catch (e) {
      console.log('GOTO_ERR', String(e).slice(0, 120))
    }
    await page.bringToFront()
    const r = await sw.evaluate(async () => {
      const [t] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      })
      try {
        const res = await chrome.scripting.executeScript({
          target: { tabId: t.id! },
          func: () =>
            document.contentType +
            ' ' +
            document.querySelectorAll('input').length,
        })
        return 'OK ' + JSON.stringify(res.map((x) => x.result))
      } catch (e) {
        return String(e)
      }
    })
    console.log('FORBIDDEN', url, '=>', r)
  })
}
