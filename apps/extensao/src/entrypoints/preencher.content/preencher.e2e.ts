import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import type { RespostaPreencher } from '../../lib/mensagens'
import {
  abrirPopup,
  enviarMensagem,
  expect,
  idDaAba,
  ORIGEM,
  pessoaGuardada,
  servir,
  test,
  type Rota,
} from '../../test/extensao.fixture'

const lerPagina = (arquivo: string) =>
  readFileSync(new URL(arquivo, import.meta.url), 'utf8')
const CADASTRO = lerPagina('./cadastro.pagina.html')
const REACT = lerPagina('./react.pagina.html')
const SIMPLES =
  '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf" style="outline: 3px dotted rgb(255, 0, 0)"></label><label>Código de indicação <input name="ref_code"></label>'
const CIANO = 'rgb(56, 189, 248)'
const AMBAR = 'rgb(245, 184, 46)'

// O React 19 não publica build UMD: a página React é empacotada aqui, em memória, com o Vite do próprio app.
let scriptReact: Promise<string> | undefined
async function empacotarReact(): Promise<string> {
  const saida = await build({
    configFile: false,
    logLevel: 'silent',
    root: import.meta.dirname,
    plugins: [react()],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL('./react.pagina.tsx', import.meta.url)),
        formats: ['es'],
        fileName: 'react.pagina',
      },
    },
  })
  const resultado = Array.isArray(saida) ? saida[0] : saida
  if (!('output' in resultado))
    throw new Error('o build da página React não devolveu código')
  return resultado.output[0].code
}

async function paginaReact(): Promise<Record<string, Rota>> {
  scriptReact ??= empacotarReact()
  return {
    '/react': { corpo: REACT },
    '/react.pagina.js': { corpo: await scriptReact, tipo: 'text/javascript' },
  }
}

async function pessoaDaExtensao(sw: Parameters<typeof pessoaGuardada>[0]) {
  const pessoa = await pessoaGuardada(sw)
  if (!pessoa) throw new Error('a extensão não guardou a pessoa')
  return pessoa
}

test('cadastro realista: 21 de 23, aviso, contornos, valores da pessoa e honeypot intocado', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/cadastro': { corpo: CADASTRO } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/cadastro`)
  const tabId = await idDaAba(sw, `${ORIGEM}/cadastro`)
  const popup = await abrirPopup(context, extensionId)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher

  // Aviso e contornos primeiro: os dois somem sozinhos depois de 4 s.
  await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
    '21 de 23 campos preenchidos',
  )
  await expect(aba.locator('piluvitu-aviso .linha2 .warn')).toHaveText(
    '2 não reconhecidos',
  )
  await expect(aba.locator('input[name="nome"]')).toHaveCSS(
    'outline-color',
    CIANO,
  )
  await expect(aba.locator('input[name="ref_code"]')).toHaveCSS(
    'outline-style',
    'dashed',
  )
  await expect(aba.locator('input[name="ref_code"]')).toHaveCSS(
    'outline-color',
    AMBAR,
  )
  await expect(aba.locator('input[name="b_7f3e_honeypot"]')).toHaveCSS(
    'outline-style',
    'none',
  )

  expect(resposta).toMatchObject({
    ok: true,
    resumo: {
      x: 21,
      y: 23,
      k: 2,
      contentType: 'text/html',
      iframesDeFora: 0,
      naoReconhecidos: [
        { rotulo: 'Código de indicação', seletor: 'input[name="ref_code"]' },
        { rotulo: 'Como nos conheceu?', seletor: 'select#origem' },
      ],
    },
  })

  const p = await pessoaDaExtensao(sw)
  const esperado: Record<string, string> = {
    nome: p.nome.completo,
    nascimento: p.nascimento.br,
    email: p.email.endereco,
    email2: p.email.endereco,
    cpf: p.cpf,
    cel: p.celular.formatado,
    senha: p.senha,
    senha2: p.senha,
    sexo: p.nome.sexo,
    cep: p.endereco.cep,
    logradouro: p.endereco.logradouro,
    numero: p.endereco.numero,
    complemento: p.endereco.complemento,
    bairro: p.endereco.bairro,
    cidade: p.endereco.cidade,
    cc: p.cartao.numeroFormatado,
    ccname: p.cartao.titular,
    mes: p.cartao.mes,
    ano: `20${p.cartao.ano}`,
    cvv: p.cartao.cvv,
    ref_code: '',
    b_7f3e_honeypot: '',
    csrf: 'x',
    q: '',
  }
  for (const [nome, valor] of Object.entries(esperado)) {
    await expect(aba.locator(`[name="${nome}"]`)).toHaveValue(valor)
  }
  await expect(
    aba.locator('select[name="estado"] option:checked'),
  ).toHaveAttribute('data-uf', p.endereco.uf)
  await expect(aba.locator('#origem')).toHaveValue('')
  await expect(aba.locator('input[name="termos"]')).not.toBeChecked()
})

test('React controlado, máscara e validação no blur enxergam o valor, sem roubar o foco', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, await paginaReact())
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/react`)
  await expect(aba.locator('input[name="nome"]')).toBeVisible()
  const tabId = await idDaAba(sw, `${ORIGEM}/react`)
  const popup = await abrirPopup(context, extensionId)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher
  const p = await pessoaDaExtensao(sw)

  expect(resposta).toMatchObject({
    ok: true,
    resumo: {
      x: 4,
      y: 5,
      k: 1,
      naoReconhecidos: [
        {
          rotulo: 'Celular (recusou o valor)',
          seletor: 'input[name="celular"]',
        },
      ],
    },
  })
  await expect(aba.locator('#estado')).toHaveText(
    JSON.stringify({
      nome: p.nome.completo,
      email: p.email.endereco,
      emailTocado: true,
      cpf: p.cpf,
    }),
  )
  await expect(aba.locator('input[name="cpf"]')).toHaveValue(p.cpf)
  await expect(aba.locator('input[name="celular"]')).toHaveValue('')
  await expect(aba.locator('#cep-validado')).toHaveText('validado')
  expect(await aba.evaluate(() => document.activeElement?.tagName)).toBe('BODY')
})

test('dois preenchimentos seguidos deixam um aviso só e devolvem o outline original do site', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/simples': { corpo: SIMPLES } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/simples`)
  const tabId = await idDaAba(sw, `${ORIGEM}/simples`)
  const popup = await abrirPopup(context, extensionId)

  await enviarMensagem(popup, { tipo: 'preencher', tabId })
  await enviarMensagem(popup, { tipo: 'preencher', tabId })
  await expect(aba.locator('piluvitu-aviso')).toHaveCount(1)
  await expect(aba.locator('input[name="cpf"]')).toHaveCSS(
    'outline-style',
    'solid',
  )

  await aba.bringToFront()
  await aba.locator('input[name="ref_code"]').click()
  await expect(aba.locator('input[name="cpf"]')).toHaveCSS(
    'outline-style',
    'dotted',
  )
  await expect(aba.locator('input[name="cpf"]')).toHaveCSS(
    'outline-color',
    'rgb(255, 0, 0)',
  )
})

test('em site com CSP estrita o aviso continua com o próprio estilo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, {
    '/csp': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
      cabecalhos: {
        'Content-Security-Policy': "default-src 'none'; style-src 'self'",
      },
    },
  })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/csp`)
  const tabId = await idDaAba(sw, `${ORIGEM}/csp`)
  const popup = await abrirPopup(context, extensionId)

  await enviarMensagem(popup, { tipo: 'preencher', tabId })
  const aviso = aba.locator('piluvitu-aviso .toast')
  await expect(aviso).toHaveCSS('width', '300px')
  await expect(aviso).toHaveCSS('border-top-left-radius', '14px')
  await expect(aba.locator('input[name="cpf"]')).toHaveCSS(
    'outline-style',
    'solid',
  )
})

test('iframe da mesma origem: campos somados e aviso só no topo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, {
    '/com-quadro': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>Nome completo <input name="nome"></label><iframe src="/quadro" style="width: 400px; height: 120px"></iframe>',
    },
    '/quadro': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
    },
  })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/com-quadro`)
  await expect(
    aba.frameLocator('iframe').locator('input[name="cpf"]'),
  ).toBeVisible()
  const tabId = await idDaAba(sw, `${ORIGEM}/com-quadro`)
  const popup = await abrirPopup(context, extensionId)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher
  const p = await pessoaDaExtensao(sw)

  expect(resposta).toMatchObject({
    ok: true,
    resumo: { x: 2, y: 2, k: 0, iframesDeFora: 0 },
  })
  await expect(aba.locator('input[name="nome"]')).toHaveValue(p.nome.completo)
  await expect(
    aba.frameLocator('iframe').locator('input[name="cpf"]'),
  ).toHaveValue(p.cpf)
  await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
    '2 de 2 campos preenchidos',
  )
  await expect(aba.locator('piluvitu-aviso .linha2')).toHaveCount(0)
  await expect(
    aba.frameLocator('iframe').locator('piluvitu-aviso'),
  ).toHaveCount(0)
})

// spec §6.3: o executeScript com allFrames pula em silêncio o frame sem permissão, e o topo conta quantos ficaram.
test('iframe de outro domínio fica de fora sem erro e é contado no topo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, {
    '/com-quadro-de-fora': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>Nome completo <input name="nome"></label><iframe src="http://outro.local/quadro" style="width: 400px; height: 120px"></iframe>',
    },
  })
  await context.route('http://outro.local/**', (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
    }),
  )
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/com-quadro-de-fora`)
  await expect(
    aba.frameLocator('iframe').locator('input[name="cpf"]'),
  ).toBeVisible()
  const tabId = await idDaAba(sw, `${ORIGEM}/com-quadro-de-fora`)
  const popup = await abrirPopup(context, extensionId)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher

  expect(resposta).toMatchObject({
    ok: true,
    resumo: { x: 1, y: 1, k: 0, iframesDeFora: 1 },
  })
  await expect(aba.locator('input[name="nome"]')).not.toHaveValue('')
  await expect(
    aba.frameLocator('iframe').locator('input[name="cpf"]'),
  ).toHaveValue('')
})

test.describe('Inserir (costura e2e da mensagem)', () => {
  test('escreve no campo focado o valor formatado para ele', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, { '/cadastro': { corpo: CADASTRO } })
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/cadastro`)
    const tabId = await idDaAba(sw, `${ORIGEM}/cadastro`)
    const popup = await abrirPopup(context, extensionId)
    await aba.bringToFront()
    await aba.locator('input[name="ref_code"]').focus()

    await enviarMensagem(popup, {
      tipo: 'inserir',
      tabId,
      frameId: 0,
      kind: 'cpf',
    })

    const p = await pessoaDaExtensao(sw)
    await expect(aba.locator('input[name="ref_code"]')).toHaveValue(p.cpf)
    await expect(aba.locator('input[name="cpf"]')).toHaveValue('')
  })

  test('em contenteditable insere o texto no cursor', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, await paginaReact())
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/react`)
    const tabId = await idDaAba(sw, `${ORIGEM}/react`)
    const popup = await abrirPopup(context, extensionId)
    await aba.bringToFront()
    await aba.locator('#nota').focus()

    await enviarMensagem(popup, {
      tipo: 'inserir',
      tabId,
      frameId: 0,
      kind: 'email',
    })

    const p = await pessoaDaExtensao(sw)
    await expect(aba.locator('#nota')).toHaveText(p.email.endereco)
  })
})
