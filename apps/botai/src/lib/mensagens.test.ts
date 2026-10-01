import { describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { enviar, type Mensagem } from './mensagens'

describe('enviar', () => {
  it('manda a mensagem pelo runtime e devolve a resposta do background', async () => {
    const recebidas: unknown[] = []
    fakeBrowser.runtime.onMessage.addListener(
      (mensagem, _remetente, responder) => {
        recebidas.push(mensagem)
        responder({ ok: false, motivo: 'proibida' })
        return true
      },
    )
    const mensagem: Mensagem = { tipo: 'preencher', tabId: 7 }
    await expect(enviar(mensagem)).resolves.toEqual({
      ok: false,
      motivo: 'proibida',
    })
    expect(recebidas).toEqual([mensagem])
  })
})
