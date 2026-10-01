import {
  test as base,
  chromium,
  type BrowserContext,
  type Worker,
} from '@playwright/test'
import path from 'node:path'

const pathToExtension = path.resolve(
  import.meta.dirname,
  '../../.output',
  process.env.EXT_BUILD ?? 'chrome-mv3-e2e',
)

export const test = base.extend<{
  context: BrowserContext
  sw: Worker
  extensionId: string
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })
    await use(context)
    await context.close()
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    await use(sw)
  },
  extensionId: async ({ sw }, use) => {
    await use(sw.url().split('/')[2])
  },
})
export const expect = test.expect
