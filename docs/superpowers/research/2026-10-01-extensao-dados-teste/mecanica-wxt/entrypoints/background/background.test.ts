import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import background, { criarMenus } from './index'

function eventoFalso<T extends (...a: any[]) => any>() {
  const ls: T[] = []
  return {
    addListener: (l: T) => ls.push(l),
    fire: (...a: Parameters<T>) => Promise.all(ls.map((l) => l(...a))),
  }
}

describe('background', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    Object.assign(fakeBrowser.contextMenus, {
      create: vi.fn(),
      removeAll: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
    })
    Object.assign(fakeBrowser.scripting, {
      executeScript: vi.fn(async () => [
        {
          frameId: 0,
          result: { preenchidos: 1, total: 1, naoReconhecidos: [] },
        },
      ]),
    })
  })

  it('cria Inserir como submenu só de campos editáveis', async () => {
    await criarMenus(null)
    const create = fakeBrowser.contextMenus.create as ReturnType<typeof vi.fn>
    expect(create).toHaveBeenCalledWith({
      id: 'inserir',
      title: 'Inserir',
      contexts: ['editable'],
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inserir:cpf',
        parentId: 'inserir',
        contexts: ['editable'],
      }),
    )
  })

  it('atalho preencher-pagina injeta o content script na aba do comando', async () => {
    const onCommand = eventoFalso()
    const onClicked = eventoFalso()
    Object.assign(fakeBrowser.commands, { onCommand })
    Object.assign(fakeBrowser.contextMenus, { onClicked })
    background.main()
    await onCommand.fire('preencher-pagina', { id: 7 })
    expect(fakeBrowser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['/content-scripts/preencher.js'],
    })
  })

  it('nova pessoa no storage atualiza o título do menu (watch)', async () => {
    const noop = { addListener: () => {} }
    Object.assign(fakeBrowser.commands, { onCommand: noop })
    Object.assign(fakeBrowser.contextMenus, { onClicked: noop })
    background.main()
    await fakeBrowser.storage.local.set({
      pessoa: {
        nome: 'x',
        cpf: '111.444.777-35',
        cep: '01310-100',
        email: 'e',
        user: 'u',
      },
    })
    await vi.waitFor(() =>
      expect(fakeBrowser.contextMenus.update).toHaveBeenCalledWith(
        'inserir:cpf',
        { title: 'CPF · 111.444.777-35' },
      ),
    )
  })
})
