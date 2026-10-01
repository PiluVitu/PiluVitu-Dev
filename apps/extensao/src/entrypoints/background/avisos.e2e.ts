import type { RespostaPreencher } from '../../lib/mensagens'
import {
  abrirPopup,
  enviarMensagem,
  expect,
  idDaAba,
  idDaAbaAtiva,
  ORIGEM,
  servir,
  test,
} from '../../test/extensao.fixture'

const SO_CPF =
  '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf" /></label>'
const SO_DIGITOS = `<!doctype html>
<meta charset="utf-8" />
<label>Código <input name="codigo" /></label>
<script>
  const codigo = document.querySelector('[name="codigo"]')
  codigo.addEventListener('input', () => {
    codigo.value = codigo.value.replace(/[^0-9]/g, '')
  })
</script>`
const SO_TEXTO =
  '<!doctype html><meta charset="utf-8"><p>Só texto, sem formulário.</p>'

test.describe('avisos de falha, sem popup', () => {
  test('Inserir sem campo em foco: "Não deu para inserir aqui: nenhum campo em foco"', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, { '/so-cpf': { corpo: SO_CPF } })
    const popup = await abrirPopup(context, extensionId)
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/so-cpf`)
    await aba.bringToFront()
    const tabId = await idDaAba(sw, `${ORIGEM}/so-cpf`)

    await enviarMensagem(popup, {
      tipo: 'inserir',
      tabId,
      frameId: 0,
      kind: 'cpf',
    })

    await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
      'Não deu para inserir aqui: nenhum campo em foco',
    )
    await expect(aba.locator('piluvitu-aviso .toast')).toHaveAttribute(
      'role',
      'alert',
    )
    await expect(aba.locator('piluvitu-aviso .linha2')).toHaveCount(0)
    await expect(aba.locator('input[name="cpf"]')).toHaveValue('')
  })

  test('Inserir num campo que desfaz o valor: "Não deu para inserir aqui: o campo recusou o valor"', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, { '/so-digitos': { corpo: SO_DIGITOS } })
    const popup = await abrirPopup(context, extensionId)
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/so-digitos`)
    await aba.bringToFront()
    const tabId = await idDaAba(sw, `${ORIGEM}/so-digitos`)
    await aba.locator('input[name="codigo"]').focus()

    await enviarMensagem(popup, {
      tipo: 'inserir',
      tabId,
      frameId: 0,
      kind: 'nomeCompleto',
    })

    await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
      'Não deu para inserir aqui: o campo recusou o valor',
    )
    await expect(aba.locator('input[name="codigo"]')).toHaveValue('')
  })

  test('Preencher numa página sem campo: "Nenhum campo nesta página", numa linha só', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, { '/so-texto': { corpo: SO_TEXTO } })
    const popup = await abrirPopup(context, extensionId)
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/so-texto`)
    await aba.bringToFront()
    const tabId = await idDaAba(sw, `${ORIGEM}/so-texto`)

    const resposta = (await enviarMensagem(popup, {
      tipo: 'preencher',
      tabId,
    })) as RespostaPreencher

    expect(resposta).toMatchObject({ ok: true, resumo: { x: 0, y: 0, k: 0 } })
    await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
      'Nenhum campo nesta página',
    )
    await expect(aba.locator('piluvitu-aviso .toast')).toHaveAttribute(
      'role',
      'alert',
    )
    await expect(aba.locator('piluvitu-aviso .linha2')).toHaveCount(0)
  })

  test('página que o Chrome recusa: nem Inserir nem Preencher deixam aviso, e o background responde', async ({
    context,
    sw,
    extensionId,
  }) => {
    await context.route('http://outro.local/**', (rota) =>
      rota.fulfill({ contentType: 'text/html; charset=utf-8', body: SO_CPF }),
    )
    const popup = await abrirPopup(context, extensionId)
    const aba = await context.newPage()
    await aba.goto('http://outro.local/form')
    await aba.bringToFront()
    const tabId = await idDaAbaAtiva(sw)
    await aba.locator('input[name="cpf"]').focus()

    // O Chrome entrega o sendResponse(undefined) do background como null; sem resposta nenhuma, seria undefined.
    await expect(
      enviarMensagem(popup, {
        tipo: 'inserir',
        tabId,
        frameId: 0,
        kind: 'cpf',
      }),
    ).resolves.toBeNull()
    const resposta = (await enviarMensagem(popup, {
      tipo: 'preencher',
      tabId,
    })) as RespostaPreencher

    expect(resposta).toEqual({ ok: false, motivo: 'proibida' })
    await expect(aba.locator('piluvitu-aviso')).toHaveCount(0)
    await expect(aba.locator('input[name="cpf"]')).toHaveValue('')
  })
})
