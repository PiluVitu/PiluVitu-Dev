import {
  test as base,
  chromium,
  type BrowserContext,
  type Worker,
} from '@playwright/test'
import path from 'node:path'

const dir = process.env.EXT_DIR ?? 'chrome-mv3-e2e'
const pathToExtension = path.resolve(import.meta.dirname, '..', '.output', dir)

export const test = base.extend<{
  context: BrowserContext
  sw: Worker
  extensionId: string
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: process.env.HEADED !== '1',
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
