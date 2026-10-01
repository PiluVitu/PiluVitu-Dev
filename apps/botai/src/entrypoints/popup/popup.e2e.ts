import {
  abrirPopup,
  ATALHO_ESPERADO,
  expect,
  idDaAba,
  ORIGEM,
  pessoaGuardada,
  servir,
  test,
} from '../../test/extensao.fixture'

test('popup: gera a pessoa no 1a e o Preencher do 1b preenche a aba-alvo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, {
    '/form': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
    },
  })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/form`)
  const tabId = await idDaAba(sw, `${ORIGEM}/form`)

  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)
  await expect(
    popup.getByRole('heading', { name: 'Ainda não há pessoa de teste' }),
  ).toBeVisible()
  await expect(popup.getByText('teste.local', { exact: true })).toBeVisible()
  const credito = popup.getByRole('button', {
    name: 'Powered by PiluTech (abre pilutech.com.br)',
  })
  await expect(credito).toBeVisible()
  await expect(credito).toHaveText('Powered by PiluTech')
  await popup.getByRole('button', { name: 'Gerar pessoa' }).click()
  await expect(
    popup.getByRole('heading', { name: 'Ainda não há pessoa de teste' }),
  ).toBeHidden()

  const pessoa = await pessoaGuardada(sw)
  if (!pessoa) throw new Error('o "Gerar pessoa" não guardou ninguém')
  await expect(
    popup.getByRole('heading', { level: 1, name: pessoa.nome.completo }),
  ).toBeVisible()
  await expect(popup.locator('kbd').first()).toHaveText(ATALHO_ESPERADO)

  await popup.getByRole('button', { name: /Preencher esta página/ }).click()
  await expect(aba.locator('input[name="cpf"]')).toHaveValue(pessoa.cpf)
  await expect(aba.locator('botai-aviso .botai-titulo')).toHaveText(
    '1 de 1 campo preenchido',
  )
  await expect(
    popup.getByRole('heading', { level: 1, name: '1 de 1 campo preenchido' }),
  ).toBeVisible()
  await expect(credito).toBeVisible()
})
