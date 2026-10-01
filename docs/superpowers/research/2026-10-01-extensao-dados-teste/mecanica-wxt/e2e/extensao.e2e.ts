import { expect, test } from './fixtures'

const FORM = 'http://127.0.0.1:4599/form.html'
const PESSOA = {
  nome: 'Maria Eduarda Souza',
  cpf: '384.529.176-19',
  cep: '01310-100',
  email: 'maria.souza.4821@tuamaeaquelaursa.com',
  user: 'maria.souza.4821',
}

async function tabIdDe(sw: import('@playwright/test').Worker, url: string) {
  return sw.evaluate(
    async (u) => (await chrome.tabs.query({ url: u }))[0]?.id,
    url,
  )
}

test('manifest carregado: permissões, sem content_scripts, comando', async ({
  sw,
}) => {
  const m = await sw.evaluate(() => chrome.runtime.getManifest())
  console.log(
    'MANIFEST',
    JSON.stringify({
      p: m.permissions,
      h: m.host_permissions,
      cs: m.content_scripts,
      war: m.web_accessible_resources,
    }),
  )
  expect(m.content_scripts).toBeUndefined()
  const cmds = await sw.evaluate(() => chrome.commands.getAll())
  console.log('COMMANDS', JSON.stringify(cmds))
})

test('menus criados no onInstalled (update só resolve se o id existe)', async ({
  sw,
}) => {
  await expect
    .poll(() =>
      sw.evaluate(async () => {
        try {
          await chrome.contextMenus.update('inserir:cpf', {})
          return 'ok'
        } catch (e) {
          return String(e)
        }
      }),
    )
    .toBe('ok')
  const r = await sw.evaluate(async () => {
    const out: Record<string, string> = {}
    for (const id of ['inserir:cpf', 'nao-existe']) {
      try {
        await chrome.contextMenus.update(id, { title: 'x' })
        out[id] = 'ok'
      } catch (e) {
        out[id] = String(e)
      }
    }
    return out
  })
  console.log('MENUS', JSON.stringify(r))
  expect(r['inserir:cpf']).toBe('ok')
})

test('popup renderiza com Tailwind + design system e grava no storage', async ({
  context,
  extensionId,
  sw,
}) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.getByText('Ainda não há pessoa de teste')).toBeVisible()
  const bg = await popup
    .getByRole('button', { name: 'Gerar pessoa' })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log('BUTTON_BG', bg)
  expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  await popup.getByRole('button', { name: 'Gerar pessoa' }).click()
  await expect(popup.getByTestId('nome')).toHaveText(PESSOA.nome)
  const stored = await sw.evaluate(() => chrome.storage.local.get(null))
  console.log('STORAGE', JSON.stringify(stored))
  // título do menu atualizado pelo watch() no background
  await expect
    .poll(() =>
      sw.evaluate(async () => {
        try {
          await chrome.contextMenus.update('inserir:cpf', {})
          return 'ok'
        } catch (e) {
          return String(e)
        }
      }),
    )
    .toBe('ok')
})

test('executeScript(files) devolve o retorno de main() e monta o toast no Shadow DOM', async ({
  context,
  sw,
}) => {
  await sw.evaluate((p) => chrome.storage.local.set({ pessoa: p }), PESSOA)
  const page = await context.newPage()
  page.on('console', (m) => console.log('PAGE_CONSOLE', m.type(), m.text()))
  await page.goto(FORM)
  const tabId = await tabIdDe(sw, FORM)
  const res = await sw.evaluate(
    async (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id! },
        files: ['/content-scripts/preencher.js'],
      }),
    tabId,
  )
  console.log('EXEC_RESULT', JSON.stringify(res))
  expect(res[0].result).toMatchObject({ preenchidos: 4, total: 5 })
  await expect(page.locator('input[name=cpf]')).toHaveValue(PESSOA.cpf)
  const toast = page.locator('piluvitu-toast').getByTestId('piluvitu-toast')
  await expect(toast).toBeVisible()
  const estilo = await toast.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      position: cs.position,
      bg: cs.backgroundColor,
      right: cs.right,
      radius: cs.borderTopLeftRadius,
    }
  })
  console.log('TOAST_STYLE', JSON.stringify(estilo))
  expect(estilo.position).toBe('fixed')
  const docStyles = await page.evaluate(
    () =>
      document.querySelectorAll('style[wxt-shadow-root-document-styles]')
        .length,
  )
  console.log('DOC_STYLES(@property hoisted)', docStyles)

  // reinjeção: o contexto antigo é invalidado e a UI antiga sai
  await sw.evaluate(
    async (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id! },
        files: ['/content-scripts/preencher.js'],
      }),
    tabId,
  )
  await expect(page.locator('piluvitu-toast')).toHaveCount(1)

  // some em 4 s
  await expect(page.locator('piluvitu-toast')).toHaveCount(0, { timeout: 6000 })
})

test('botão direito foca o campo: document.activeElement acha o alvo', async ({
  context,
  sw,
}) => {
  const page = await context.newPage()
  await page.goto(FORM)
  await page.locator('input[name=cep]').click({ button: 'right' })
  const tabId = await tabIdDe(sw, FORM)
  const [r] = await sw.evaluate(
    async (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id!, frameIds: [0] },
        func: () =>
          (document.activeElement as HTMLInputElement | null)?.name ?? null,
      }),
    tabId,
  )
  console.log('ACTIVE_AFTER_RIGHT_CLICK', r.result)
  expect(r.result).toBe('cep')
})

test('atalho Alt+Shift+P via teclado sintético dispara onCommand?', async ({
  context,
  sw,
}) => {
  await sw.evaluate((p) => chrome.storage.local.set({ pessoa: p }), PESSOA)
  const page = await context.newPage()
  await page.goto(FORM)
  await page.bringToFront()
  await page.keyboard.press('Alt+Shift+P')
  await page.waitForTimeout(1500)
  const v = await page.locator('input[name=cpf]').inputValue()
  console.log('COMMAND_VIA_SYNTHETIC_KEYS_FILLED', v === PESSOA.cpf)
})
