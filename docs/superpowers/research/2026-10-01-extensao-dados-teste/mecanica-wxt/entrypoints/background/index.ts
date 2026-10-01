import {
  pessoaItem,
  tituloMenu,
  TIPOS_INSERIR,
  type Pessoa,
  type ResultadoPreencher,
  type TipoInserir,
} from '@/utils/pessoa'

export const MENU = {
  preencher: 'preencher',
  inserir: 'inserir',
  novaPessoa: 'nova-pessoa',
  caixa: 'caixa',
} as const

export async function criarMenus(p: Pessoa | null) {
  await browser.contextMenus.removeAll()
  browser.contextMenus.create({
    id: MENU.preencher,
    title: 'Preencher esta página',
    contexts: ['page', 'editable'],
  })
  browser.contextMenus.create({
    id: MENU.inserir,
    title: 'Inserir',
    contexts: ['editable'],
  })
  for (const tipo of TIPOS_INSERIR) {
    browser.contextMenus.create({
      id: `inserir:${tipo}`,
      parentId: MENU.inserir,
      title: tituloMenu(tipo, p),
      contexts: ['editable'],
    })
  }
  browser.contextMenus.create({
    id: MENU.novaPessoa,
    title: 'Nova pessoa',
    contexts: ['page', 'editable'],
  })
}

export async function atualizarTitulos(p: Pessoa | null) {
  for (const tipo of ['cpf', 'cep'] as const) {
    await browser.contextMenus.update(`inserir:${tipo}`, {
      title: tituloMenu(tipo, p),
    })
  }
}

export async function preencherPagina(
  tabId: number,
): Promise<ResultadoPreencher | undefined> {
  const [res] = await browser.scripting.executeScript({
    target: { tabId },
    files: ['/content-scripts/preencher.js'],
  })
  return res?.result as ResultadoPreencher | undefined
}

export async function inserir(
  tabId: number,
  frameId: number,
  tipo: TipoInserir,
) {
  const p = await pessoaItem.getValue()
  if (!p) return
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (valor: string) => {
      let el: Element | null = document.activeElement
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const proto = Object.getPrototypeOf(el)
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, valor)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        document.execCommand('insertText', false, valor)
        return true
      }
      return false
    },
    args: [String(p[tipo])],
  })
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await criarMenus(await pessoaItem.getValue())
  })

  pessoaItem.watch((p) => {
    void atualizarTitulos(p)
  })

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (tab?.id == null) return
    const id = String(info.menuItemId)
    if (id === MENU.preencher) await preencherPagina(tab.id)
    else if (id.startsWith('inserir:'))
      await inserir(tab.id, info.frameId ?? 0, id.slice(8) as TipoInserir)
  })

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command === 'preencher-pagina' && tab?.id != null)
      await preencherPagina(tab.id)
  })
})
