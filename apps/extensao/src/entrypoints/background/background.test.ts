import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import background from './index'

// commands e contextMenus.onClicked não existem no fakeBrowser: eventos falsos que o teste dispara.
function eventoFalso<A extends unknown[]>() {
  const ouvintes: ((...a: A) => unknown)[] = []
  return {
    addListener(ouvinte: (...a: A) => unknown) {
      ouvintes.push(ouvinte)
    },
    async disparar(...a: A) {
      await Promise.all(ouvintes.map((ouvinte) => ouvinte(...a)))
    },
  }
}

const executar =
  vi.fn<
    (injecao: {
      target: Record<string, unknown>
      files?: string[]
    }) => Promise<unknown>
  >()
const criar = vi.fn()
const atualizar = vi.fn(async () => undefined)
let onCommand = eventoFalso<[string, { id: number }?]>()
let onClicked =
  eventoFalso<[{ menuItemId: string; frameId?: number }, { id: number }?]>()

beforeEach(() => {
  executar.mockReset()
  executar.mockImplementation(async (injecao) =>
    injecao.files
      ? [{ documentId: 'd', frameId: 0 }]
      : [{ documentId: 'd', frameId: 0, result: null }],
  )
  criar.mockReset()
  atualizar.mockClear()
  onCommand = eventoFalso<[string, { id: number }?]>()
  onClicked =
    eventoFalso<[{ menuItemId: string; frameId?: number }, { id: number }?]>()
  Object.assign(fakeBrowser.scripting, { executeScript: executar })
  Object.assign(fakeBrowser.contextMenus, {
    create: criar,
    removeAll: vi.fn(async () => undefined),
    update: atualizar,
    onClicked,
  })
  Object.assign(fakeBrowser.commands, { onCommand })
  background.main()
})

describe('background', () => {
  it('cria os menus na instalação e na abertura do navegador', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' })
    await vi.waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'preencher' }),
      ),
    )
    criar.mockClear()
    await fakeBrowser.runtime.onStartup.trigger()
    await vi.waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'abrir-caixa' }),
      ),
    )
  })

  it('pessoa nova atualiza os títulos de CPF e CEP do menu', async () => {
    await pessoaItem.setValue(P)
    await vi.waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith('inserir:cpf', {
        title: `CPF · ${P.cpf}`,
      }),
    )
    expect(atualizar).toHaveBeenCalledWith('inserir:cep', {
      title: `CEP · ${P.endereco.cep}`,
    })
  })

  it('o atalho preencher-pagina injeta o content script na aba do comando', async () => {
    await onCommand.disparar('preencher-pagina', { id: 7 })
    await vi.waitFor(() =>
      expect(executar).toHaveBeenCalledWith({
        target: { tabId: 7, allFrames: true },
        files: ['/content-scripts/preencher.js'],
      }),
    )
  })

  it('o clique no menu chega ao handler', async () => {
    await onClicked.disparar({ menuItemId: 'preencher' }, { id: 9 })
    await vi.waitFor(() =>
      expect(executar).toHaveBeenCalledWith(
        expect.objectContaining({ target: { tabId: 9, allFrames: true } }),
      ),
    )
  })

  it('a mensagem do popup volta com a resposta do background', async () => {
    await expect(
      fakeBrowser.runtime.sendMessage({ tipo: 'preencher', tabId: 7 }),
    ).resolves.toMatchObject({ ok: true })
  })
})
