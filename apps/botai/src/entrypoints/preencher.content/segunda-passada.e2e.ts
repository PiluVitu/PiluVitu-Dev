import type { RespostaPreencher } from '../../lib/mensagens'
import {
  abrirPopup,
  enviarMensagem,
  exigirPessoa,
  expect,
  idDaAba,
  ORIGEM,
  servir,
  test,
} from '../../test/extensao.fixture'

// Como um site que chama o ViaCEP no input do CEP: 200 ms depois, sobrescreve o complemento com o do ViaCEP.
const ENDERECO_COM_BUSCA = `<!doctype html>
<html lang="pt-BR">
  <meta charset="utf-8" />
  <title>Endereço</title>
  <form>
    <label>CEP <input name="cep" id="cep" /></label>
    <label>Rua <input name="logradouro" /></label>
    <label>Número <input name="numero" /></label>
    <label>Complemento <input name="complemento" /></label>
    <label>Bairro <input name="bairro" /></label>
    <label>Cidade <input name="cidade" /></label>
  </form>
  <script>
    window.buscas = 0
    window.siteSobrescreveu = false
    document.getElementById('cep').addEventListener('input', (evento) => {
      if (evento.target.value.replace(/[^0-9]/g, '').length !== 8) return
      window.buscas += 1
      setTimeout(() => {
        document.querySelector('[name="complemento"]').value = 'de 612 a 1510 - lado par'
        window.siteSobrescreveu = true
      }, 200)
    })
  </script>
</html>`

interface JanelaComBusca {
  buscas: number
  siteSobrescreveu: boolean
}

test('a busca de CEP do site sobrescreve o complemento e a 2ª passada devolve o da pessoa', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/endereco': { corpo: ENDERECO_COM_BUSCA } })
  const popup = await abrirPopup(context, extensionId)
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/endereco`)
  await aba.bringToFront()
  const tabId = await idDaAba(sw, `${ORIGEM}/endereco`)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher
  expect(resposta).toMatchObject({ ok: true, resumo: { x: 6, y: 6, k: 0 } })
  const pessoa = await exigirPessoa(sw)

  await expect
    .poll(() =>
      aba.evaluate(
        () => (window as unknown as JanelaComBusca).siteSobrescreveu,
      ),
    )
    .toBe(true)
  await expect(aba.locator('[name="complemento"]')).toHaveValue(
    pessoa.endereco.complemento,
  )
  await expect(aba.locator('[name="logradouro"]')).toHaveValue(
    pessoa.endereco.logradouro,
  )
  expect(
    await aba.evaluate(() => (window as unknown as JanelaComBusca).buscas),
  ).toBe(1)
})
