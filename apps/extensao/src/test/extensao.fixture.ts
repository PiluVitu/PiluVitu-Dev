import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import path from 'node:path'
import type { browser } from 'wxt/browser'
import type { Mensagem } from '../lib/mensagens'

declare const chrome: typeof browser

const EXTENSAO = path.resolve(
  import.meta.dirname,
  '../../.output/chrome-mv3-e2e',
)
export const ORIGEM = 'http://teste.local'

export interface Rota {
  corpo: string
  tipo?: string
  cabecalhos?: Record<string, string>
}

export const test = base.extend<{
  context: BrowserContext
  sw: Worker
  extensionId: string
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSAO}`,
        `--load-extension=${EXTENSAO}`,
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

export async function servir(
  context: BrowserContext,
  rotas: Record<string, Rota>,
): Promise<void> {
  await context.route(`${ORIGEM}/**`, (rota) => {
    const pagina = rotas[new URL(rota.request().url()).pathname]
    if (!pagina) return rota.fulfill({ status: 404, body: 'não encontrado' })
    return rota.fulfill({
      status: 200,
      contentType: pagina.tipo ?? 'text/html; charset=utf-8',
      headers: pagina.cabecalhos,
      body: pagina.corpo,
    })
  })
}

export async function idDaAba(sw: Worker, url: string): Promise<number> {
  const id = await sw.evaluate(
    async (u) => (await chrome.tabs.query({ url: u }))[0]?.id,
    url,
  )
  if (id === undefined) throw new Error(`nenhuma aba em ${url}`)
  return id
}

export async function abrirPopup(
  context: BrowserContext,
  extensionId: string,
  busca = '',
): Promise<Page> {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html${busca}`)
  return popup
}

export function enviarMensagem(
  popup: Page,
  mensagem: Mensagem,
): Promise<unknown> {
  return popup.evaluate((m) => chrome.runtime.sendMessage(m), mensagem)
}

export async function pessoaGuardada(sw: Worker): Promise<Pessoa | undefined> {
  const { pessoa } = await sw.evaluate(() => chrome.storage.local.get('pessoa'))
  return pessoa as Pessoa | undefined
}
