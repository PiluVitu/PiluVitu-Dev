import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import type { Mensagem } from '../../lib/mensagens'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import {
  aoClicarMenu,
  aoComando,
  aoReceberMensagem,
  recriarMenus,
} from './ouvintes'

interface Injecao {
  target: Record<string, unknown>
  files?: string[]
  args?: unknown[]
}
const executar = vi.fn<(injecao: Injecao) => Promise<unknown>>()
const criar = vi.fn()

beforeEach(async () => {
  executar.mockReset()
  executar.mockImplementation(async (injecao) =>
    injecao.files
      ? [{ documentId: 'doc-0', frameId: 0 }]
      : [{ documentId: 'doc-0', frameId: 0, result: null }],
  )
  criar.mockReset()
  Object.assign(fakeBrowser.scripting, { executeScript: executar })
  Object.assign(fakeBrowser.contextMenus, {
    create: criar,
    removeAll: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  })
  await pessoaItem.setValue(P)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const ABA = { id: 7 } as Browser.tabs.Tab
const clique = (menuItemId: string, frameId = 0) =>
  ({
    menuItemId,
    frameId,
    editable: true,
    pageUrl: 'http://localhost:3000/',
  }) as Browser.contextMenus.OnClickData
const chamada = (n: number) => executar.mock.calls[n][0]

describe('aoComando', () => {
  it('Alt+Shift+P (botai-preencher) preenche a aba do comando', async () => {
    await aoComando('botai-preencher', ABA)
    expect(chamada(0).target).toEqual({ tabId: 7, allFrames: true })
  })

  it('ignora outro comando (inclusive o antigo preencher-pagina) e comando sem aba', async () => {
    await aoComando('outro', ABA)
    await aoComando('preencher-pagina', ABA)
    await aoComando('botai-preencher', undefined)
    expect(executar).not.toHaveBeenCalled()
  })

  it('sem pessoa guardada, o atalho gera uma antes de preencher', async () => {
    await pessoaItem.setValue(null)
    await aoComando('botai-preencher', ABA)
    expect(await pessoaItem.getValue()).not.toBeNull()
  })
})

describe('aoClicarMenu', () => {
  it('"Preencher esta página" preenche a aba do clique', async () => {
    await aoClicarMenu(clique('botai-preencher'), ABA)
    expect(chamada(0).target).toEqual({ tabId: 7, allFrames: true })
  })

  it('Inserir › CPF injeta no frame do clique com o kind', async () => {
    await aoClicarMenu(clique('botai-inserir:cpf', 3), ABA)
    expect(chamada(0).target).toEqual({ tabId: 7, frameIds: [3] })
    expect(chamada(1).args).toEqual([P, 'cpf'])
  })

  it('"Nova pessoa" troca a pessoa guardada', async () => {
    await aoClicarMenu(clique('botai-nova-pessoa'), ABA)
    expect(await pessoaItem.getValue()).not.toEqual(P)
  })

  it('"Abrir caixa de entrada" abre a caixa pública da pessoa numa aba nova', async () => {
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await aoClicarMenu(clique('botai-abrir-caixa'), ABA)
    expect(abrir).toHaveBeenCalledWith({ url: P.email.caixaUrl })
  })

  it('"Abrir caixa de entrada" sem pessoa gera uma antes', async () => {
    await pessoaItem.setValue(null)
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await aoClicarMenu(clique('botai-abrir-caixa'), undefined)
    const gerada = await pessoaItem.getValue()
    expect(abrir).toHaveBeenCalledWith({ url: gerada?.email.caixaUrl })
  })
})

describe('aoReceberMensagem', () => {
  it('preencher responde por sendResponse e devolve true literal', async () => {
    const responder = vi.fn()
    expect(
      aoReceberMensagem({ tipo: 'preencher', tabId: 7 }, {}, responder),
    ).toBe(true)
    await vi.waitFor(() =>
      expect(responder).toHaveBeenCalledWith({
        ok: true,
        resumo: expect.objectContaining({ x: 0, y: 0, k: 0 }),
      }),
    )
  })

  it('mostrar responde com o que __botai.mostrar devolveu', async () => {
    executar.mockResolvedValue([
      { documentId: 'doc-1', frameId: 2, result: true },
    ])
    const responder = vi.fn()
    expect(
      aoReceberMensagem(
        { tipo: 'mostrar', tabId: 7, documentId: 'doc-1', idx: 4 },
        {},
        responder,
      ),
    ).toBe(true)
    await vi.waitFor(() => expect(responder).toHaveBeenCalledWith(true))
  })

  it('inserir só é aceito no build e2e', async () => {
    const responder = vi.fn()
    const inserir: Mensagem = {
      tipo: 'inserir',
      tabId: 7,
      frameId: 0,
      kind: 'cpf',
    }
    expect(aoReceberMensagem(inserir, {}, responder)).toBeUndefined()
    expect(executar).not.toHaveBeenCalled()
    vi.stubEnv('MODE', 'e2e')
    expect(aoReceberMensagem(inserir, {}, responder)).toBe(true)
    await vi.waitFor(() => expect(responder).toHaveBeenCalledTimes(1))
    expect(chamada(1).args).toEqual([P, 'cpf'])
  })

  it('mensagem desconhecida não segura o canal', () => {
    expect(
      aoReceberMensagem({ tipo: 'outra' } as unknown as Mensagem, {}, vi.fn()),
    ).toBeUndefined()
  })

  it('erro inesperado é registrado e ainda responde, para o popup não ficar esperando', async () => {
    executar.mockRejectedValue(new Error('No tab with id: 7.'))
    const registrar = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const responder = vi.fn()
    aoReceberMensagem({ tipo: 'preencher', tabId: 7 }, {}, responder)
    await vi.waitFor(() => expect(responder).toHaveBeenCalledWith(undefined))
    expect(registrar).toHaveBeenCalled()
  })
})

describe('recriarMenus', () => {
  it('recria os menus com o CPF da pessoa guardada no título', async () => {
    await recriarMenus()
    expect(criar).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'botai-inserir:cpf',
        title: `CPF · ${P.cpf}`,
      }),
    )
  })
})
