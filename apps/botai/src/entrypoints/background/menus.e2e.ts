import type { browser } from 'wxt/browser'
import { ATALHO_ESPERADO, expect, test } from '../../test/extensao.fixture'

declare const chrome: typeof browser

test('a instalação cria o menu completo e registra o atalho', async ({
  sw,
}) => {
  const existe = (id: string) =>
    sw.evaluate(async (i) => {
      try {
        await chrome.contextMenus.update(i, {})
        return true
      } catch {
        return false
      }
    }, id)
  // Os menus nascem de forma assíncrona depois da instalação: espera o primeiro aparecer.
  await expect.poll(() => existe('botai-inserir:cpf')).toBe(true)
  for (const id of [
    'botai-preencher',
    'botai-inserir',
    'botai-inserir:tituloEleitor',
    'botai-nova-pessoa',
    'botai-abrir-caixa',
  ]) {
    expect(await existe(id)).toBe(true)
  }
  expect(await existe('nao-existe')).toBe(false)
  const comandos = await sw.evaluate(() => chrome.commands.getAll())
  expect(comandos.find((c) => c.name === 'botai-preencher')).toMatchObject({
    description: 'Preencher esta página',
    shortcut: expect.stringMatching(ATALHO_ESPERADO),
  })
})
