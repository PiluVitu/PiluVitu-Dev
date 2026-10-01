import type { FieldKind } from '@piluvitu/tools/campos'
import { browser, type Browser } from 'wxt/browser'
import {
  gerarPessoaNova,
  obterOuGerarPessoa,
  pessoaItem,
} from '../../lib/armazenamento'
import type { Mensagem } from '../../lib/mensagens'
import { criarMenus, MENU, PREFIXO_INSERIR } from '../../lib/menus'
import { inserirNoCampo, mostrarCampo, preencherPagina } from './acoes'

export const COMANDO_PREENCHER = 'preencher-pagina'

export async function recriarMenus(): Promise<void> {
  await criarMenus(await pessoaItem.getValue())
}

export async function aoComando(
  comando: string,
  aba?: Browser.tabs.Tab,
): Promise<void> {
  if (comando === COMANDO_PREENCHER && aba?.id !== undefined)
    await preencherPagina(aba.id)
}

export async function aoClicarMenu(
  info: Browser.contextMenus.OnClickData,
  aba?: Browser.tabs.Tab,
): Promise<void> {
  const id = String(info.menuItemId)
  if (id === MENU.novaPessoa) {
    await gerarPessoaNova()
    return
  }
  if (id === MENU.abrirCaixa) {
    const pessoa = await obterOuGerarPessoa()
    await browser.tabs.create({ url: pessoa.email.caixaUrl })
    return
  }
  if (aba?.id === undefined) return
  if (id === MENU.preencher) await preencherPagina(aba.id)
  else if (id.startsWith(PREFIXO_INSERIR)) {
    await inserirNoCampo(
      aba.id,
      info.frameId ?? 0,
      id.slice(PREFIXO_INSERIR.length) as FieldKind,
    )
  }
}

function executar(mensagem: Mensagem): Promise<unknown> | undefined {
  switch (mensagem?.tipo) {
    case 'preencher':
      return preencherPagina(mensagem.tabId)
    case 'mostrar':
      return mostrarCampo(mensagem.tabId, mensagem.documentId, mensagem.idx)
    case 'inserir':
      return import.meta.env.MODE === 'e2e'
        ? inserirNoCampo(mensagem.tabId, mensagem.frameId, mensagem.kind)
        : undefined
    default:
      return undefined
  }
}

// `return true` literal + sendResponse, nunca Promise: o Chrome só aceita Promise no onMessage a partir do 148.
export function aoReceberMensagem(
  mensagem: Mensagem,
  _remetente: Browser.runtime.MessageSender,
  responder: (resposta?: unknown) => void,
): true | undefined {
  const tarefa = executar(mensagem)
  if (!tarefa) return undefined
  tarefa.then(responder, (erro: unknown) => {
    console.error(erro)
    responder(undefined)
  })
  return true
}
