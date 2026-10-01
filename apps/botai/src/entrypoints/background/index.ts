import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { pessoaItem } from '../../lib/armazenamento'
import { atualizarTitulosMenu } from '../../lib/menus'
import {
  aoClicarMenu,
  aoComando,
  aoReceberMensagem,
  recriarMenus,
} from './ouvintes'

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void recriarMenus())
  browser.runtime.onStartup.addListener(() => void recriarMenus())
  pessoaItem.watch((pessoa) => void atualizarTitulosMenu(pessoa))
  browser.commands.onCommand.addListener(
    (comando, aba) => void aoComando(comando, aba),
  )
  browser.contextMenus.onClicked.addListener(
    (info, aba) => void aoClicarMenu(info, aba),
  )
  browser.runtime.onMessage.addListener(aoReceberMensagem)
})
