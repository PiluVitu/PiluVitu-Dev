import type { Page } from '@playwright/test'
import {
  abrirPopup,
  exigirPessoa,
  expect,
  idDaAba,
  idDaAbaAtiva,
  ORIGEM,
  servir,
  test,
} from '../../test/extensao.fixture'

const OUTRA_ORIGEM = 'http://outro.local'

// O "Código de indicação" fica abaixo da dobra; a página guarda a cor do contorno a cada mudança no style dele.
const CADASTRO_LONGO = `<!doctype html>
<html lang="pt-BR">
  <meta charset="utf-8" />
  <title>Cadastro</title>
  <form>
    <label>Nome completo <input name="nome" /></label>
    <label>E-mail <input type="email" name="email" /></label>
    <label>CPF <input name="cpf" /></label>
    <label>CEP <input name="cep" /></label>
    <div style="height: 2000px"></div>
    <label>Código de indicação <input name="ref_code" placeholder="opcional" /></label>
    <label>Como nos conheceu? <select id="origem"><option value="">Selecione</option><option>Google</option><option>Amigo</option></select></label>
  </form>
  <script>
    window.coresDoContorno = []
    const indicacao = document.querySelector('[name="ref_code"]')
    new MutationObserver(() => window.coresDoContorno.push(getComputedStyle(indicacao).outlineColor)).observe(
      indicacao,
      { attributes: true, attributeFilter: ['style'] },
    )
  </script>
</html>`

// Três campos sem nada que o classificador conheça; a página conta quantos avisos a extensão montou.
const SEM_RECONHECER = `<!doctype html>
<html lang="pt-BR">
  <meta charset="utf-8" />
  <title>Interno</title>
  <form><input name="campo_x" /><input name="campo_y" /><input name="campo_z" /></form>
  <script>
    window.avisosMontados = 0
    new MutationObserver((mudancas) => {
      for (const mudanca of mudancas)
        for (const no of mudanca.addedNodes)
          if (no instanceof Element && (no.matches('piluvitu-aviso') || no.querySelector('piluvitu-aviso')))
            window.avisosMontados += 1
    }).observe(document.documentElement, { childList: true, subtree: true })
  </script>
</html>`

const SO_TEXTO =
  '<!doctype html><meta charset="utf-8"><title>Sobre</title><p>Só texto, sem formulário.</p>'

async function gerarEPreencher(popup: Page) {
  await popup.getByRole('button', { name: 'Gerar pessoa' }).click()
  await popup.getByRole('button', { name: /Preencher esta página/ }).click()
}

test('popup → 1c: X de Y, caminho e não reconhecidos; a mira rola a página e pisca o campo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/cadastro': { corpo: CADASTRO_LONGO } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/cadastro`)
  const tabId = await idDaAba(sw, `${ORIGEM}/cadastro`)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)

  await gerarEPreencher(popup)
  const pessoa = await exigirPessoa(sw)

  await expect(
    popup.getByRole('heading', { level: 1, name: '4 de 6 campos preenchidos' }),
  ).toBeVisible()
  await expect(
    popup.getByText(`/cadastro · com ${pessoa.nome.completo}`),
  ).toBeVisible()
  await expect(
    popup
      .getByRole('img', { name: '4 de 6 campos preenchidos' })
      .locator('span'),
  ).toHaveCount(6)
  await expect(popup.getByRole('listitem')).toHaveText([
    /Código de indicação\s*input\[name="ref_code"\]/,
    /Como nos conheceu\?\s*select#origem/,
  ])
  await expect(popup.locator('header .bg-ok')).toHaveCount(1)
  await expect(popup.getByRole('contentinfo')).toContainText('preenche de novo')
  await expect(popup.getByRole('button', { name: 'alterar' })).toHaveCount(0)

  const indicacaoNaTela = () =>
    aba.evaluate(() => {
      const r = document
        .querySelector('[name="ref_code"]')
        ?.getBoundingClientRect()
      return r !== undefined && r.top >= 0 && r.bottom <= window.innerHeight
    })
  expect(await indicacaoNaTela()).toBe(false)

  await popup
    .getByRole('button', { name: 'Mostrar na página: Código de indicação' })
    .click()
  await aba.bringToFront()
  await expect.poll(indicacaoNaTela).toBe(true)
  await expect
    .poll(() =>
      aba.evaluate(
        () =>
          (window as unknown as { coresDoContorno: string[] }).coresDoContorno,
      ),
    )
    .toContain('rgba(0, 0, 0, 0)')
})

test('nenhum campo reconhecido → 1d com pílula warn; "Tentar de novo" preenche outra vez; o warn fica no 1b', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/interno': { corpo: SEM_RECONHECER } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/interno`)
  const tabId = await idDaAba(sw, `${ORIGEM}/interno`)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)
  const avisosMontados = () =>
    aba.evaluate(
      () => (window as unknown as { avisosMontados: number }).avisosMontados,
    )

  await gerarEPreencher(popup)
  const pessoa = await exigirPessoa(sw)

  await expect(
    popup.getByRole('heading', {
      level: 1,
      name: 'Nenhum campo reconhecido nesta página',
    }),
  ).toBeVisible()
  await expect(
    popup.getByText(/Encontrei 3 campos, mas nenhum com/),
  ).toBeVisible()
  await expect(popup.locator('header .bg-warn')).toHaveCount(1)
  await expect(popup.getByRole('contentinfo')).toContainText(
    'preenche sem abrir',
  )
  await expect(popup.getByRole('button', { name: 'alterar' })).toHaveCount(0)
  await expect.poll(avisosMontados).toBe(1)

  await popup.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect.poll(avisosMontados).toBe(2)
  await expect(aba.locator('piluvitu-aviso')).toHaveCount(1)
  await expect(
    popup.getByRole('heading', {
      level: 1,
      name: 'Nenhum campo reconhecido nesta página',
    }),
  ).toBeVisible()

  await popup.getByRole('button', { name: 'Ver os dados' }).click()
  await expect(
    popup.getByRole('heading', { level: 1, name: pessoa.nome.completo }),
  ).toBeVisible()
  await expect(popup.locator('header .bg-warn')).toHaveCount(1)
})

test('página sem formulário → 1d "Nenhum formulário nesta página", com pílula warn', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/sobre': { corpo: SO_TEXTO } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/sobre`)
  const tabId = await idDaAba(sw, `${ORIGEM}/sobre`)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)

  await gerarEPreencher(popup)

  await expect(
    popup.getByRole('heading', {
      level: 1,
      name: 'Nenhum formulário nesta página',
    }),
  ).toBeVisible()
  await expect(
    popup.getByText(
      'Não achei campos de formulário visíveis. Formulários dentro de iframe de outro domínio ficam de fora.',
    ),
  ).toBeVisible()
  await expect(popup.locator('header .bg-warn')).toHaveCount(1)
})

test('Preencher numa página que o Chrome recusa → 1e sem rodapé; "Ver os dados" → 1b com Preencher desabilitado e cadeado', async ({
  context,
  sw,
  extensionId,
}) => {
  await context.route(`${OUTRA_ORIGEM}/**`, (rota) =>
    rota.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf" /></label>',
    }),
  )
  const aba = await context.newPage()
  await aba.goto(`${OUTRA_ORIGEM}/form`)
  await aba.bringToFront()
  const tabId = await idDaAbaAtiva(sw)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)

  await gerarEPreencher(popup)
  const pessoa = await exigirPessoa(sw)

  await expect(
    popup.getByRole('heading', {
      level: 1,
      name: 'O Chrome não deixa extensões mexerem nesta página',
    }),
  ).toBeVisible()
  await expect(
    popup.getByRole('button', { name: /Preencher esta página/ }),
  ).toBeDisabled()
  await expect(popup.getByRole('contentinfo')).toHaveCount(0)
  await expect(popup.locator('header svg[data-icon="lock"]')).toHaveCount(1)
  await expect(popup.getByText(pessoa.nome.completo)).toBeVisible()
  await expect(aba.locator('input[name="cpf"]')).toHaveValue('')
  await expect(aba.locator('piluvitu-aviso')).toHaveCount(0)

  await popup.getByRole('button', { name: 'Ver os dados' }).click()
  await expect(
    popup.getByRole('heading', { level: 1, name: pessoa.nome.completo }),
  ).toBeVisible()
  await expect(
    popup.getByRole('button', { name: /Preencher esta página/ }),
  ).toBeDisabled()
  await expect(popup.locator('header svg[data-icon="lock"]')).toHaveCount(1)
})
