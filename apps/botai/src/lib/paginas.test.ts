import { describe, expect, it } from 'vitest'
import type { Navegador } from './navegador'
import {
  caminhoDaUrl,
  erroEhPaginaProibida,
  rotuloDoHost,
  situacaoDaUrl,
} from './paginas'

const TODOS: readonly Navegador[] = ['chrome', 'edge', 'opera', 'firefox']

describe('situacaoDaUrl', () => {
  it.each([
    'chrome://settings',
    'chrome-extension://abcdefgh/popup.html',
    'edge://settings',
    'about:blank',
    'view-source:https://exemplo.com.br/',
    'devtools://devtools/bundled/inspector.html',
    'data:text/html,<input>',
    'https://chromewebstore.google.com/detail/xyz',
    'https://chrome.google.com/webstore/detail/xyz',
  ])('%s é proibida no Chrome pela própria URL, sem injetar nada', (url) => {
    expect(situacaoDaUrl(url, true, 'chrome')).toBe('proibida')
  })

  it.each([
    'http://localhost:3000/cadastro',
    'https://staging.app.dev/conta',
    'https://chrome.google.com/search',
  ])('%s é uma página comum', (url) => {
    expect(situacaoDaUrl(url, false, 'chrome')).toBe('ok')
  })

  it('file: depende do acesso a arquivos liberado', () => {
    expect(situacaoDaUrl('file:///Users/eu/form.html', false, 'chrome')).toBe(
      'arquivo-sem-acesso',
    )
    expect(situacaoDaUrl('file:///Users/eu/form.html', true, 'chrome')).toBe(
      'ok',
    )
    expect(situacaoDaUrl('file:///Users/eu/form.html', false, 'firefox')).toBe(
      'arquivo-sem-acesso',
    )
  })

  it('sem URL (aba sem permissão concedida) deixa tentar', () => {
    expect(situacaoDaUrl(undefined, false, 'chrome')).toBe('ok')
  })
})

describe('situacaoDaUrl por navegador', () => {
  it.each([
    'about:addons',
    'moz-extension://0d1e2f3a/popup.html',
    'resource://pdf.js/web/viewer.html',
    'opera://settings',
  ])(
    '%s é proibida em todo navegador (o esquema só existe no próprio)',
    (url) => {
      for (const navegador of TODOS)
        expect(situacaoDaUrl(url, true, navegador)).toBe('proibida')
    },
  )

  it.each([
    ['https://addons.mozilla.org/pt-BR/firefox/addon/x/', 'firefox'],
    ['https://support.mozilla.org/pt-BR/', 'firefox'],
    ['https://accounts.firefox.com/', 'firefox'],
    ['https://microsoftedge.microsoft.com/addons/detail/x', 'edge'],
    ['https://addons.opera.com/pt-br/extensions/', 'opera'],
    ['https://chromewebstore.google.com/detail/xyz', 'chrome'],
    ['https://chromewebstore.google.com/detail/xyz', 'edge'],
    ['https://chromewebstore.google.com/detail/xyz', 'opera'],
  ] as const)('%s é proibida no %s', (url, navegador) => {
    expect(situacaoDaUrl(url, true, navegador)).toBe('proibida')
  })

  it.each([
    ['https://addons.mozilla.org/pt-BR/firefox/', 'chrome'],
    ['https://addons.mozilla.org/pt-BR/firefox/', 'edge'],
    ['https://microsoftedge.microsoft.com/addons/', 'chrome'],
    ['https://addons.opera.com/', 'firefox'],
    ['https://chromewebstore.google.com/detail/xyz', 'firefox'],
  ] as const)(
    '%s é página comum no %s: um site só é protegido pelo próprio navegador',
    (url, navegador) => {
      expect(situacaoDaUrl(url, true, navegador)).toBe('ok')
    },
  )

  it('no Firefox, a lista é de hosts exatos: subdomínio fora dela é página comum; maiúsculas e porta não escapam', () => {
    expect(
      situacaoDaUrl('https://blog.addons.mozilla.org/', true, 'firefox'),
    ).toBe('ok')
    expect(situacaoDaUrl('https://ADDONS.mozilla.org/', true, 'firefox')).toBe(
      'proibida',
    )
    expect(
      situacaoDaUrl('https://addons.mozilla.org:8443/pt-BR/', true, 'firefox'),
    ).toBe('proibida')
  })
})

describe('erroEhPaginaProibida', () => {
  it.each([
    'Cannot access a chrome:// URL',
    'The extensions gallery cannot be scripted.',
    'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    'Cannot access contents of url "file:///tmp/a.html". Extension manifest must request permission to access this host.',
    'Cannot access a chrome-extension:// URL of different extension',
    'Missing host permission for the tab',
    'Missing host permission for the tab or frames',
  ])('reconhece a recusa do navegador: %s', (mensagem) => {
    expect(erroEhPaginaProibida(mensagem)).toBe(true)
  })

  it.each([
    'No tab with id: 7.',
    'Frame with ID 0 was removed.',
    'Could not establish connection.',
    'TypeError: can\'t access property "openOrClosedShadowRoot", T.dom is undefined',
  ])('não confunde outros erros com página proibida: %s', (mensagem) => {
    expect(erroEhPaginaProibida(mensagem)).toBe(false)
  })
})

describe('rotuloDoHost', () => {
  it.each([
    ['http://localhost:3000/cadastro?x=1', 'localhost:3000'],
    ['https://staging.app.dev/conta', 'staging.app.dev'],
    ['chrome://settings/passwords', 'chrome://settings'],
    ['about:blank', 'about:blank'],
    ['file:///Users/eu/form.html', 'arquivo local'],
    ['data:text/html,<input>', 'data:'],
    [undefined, 'página atual'],
  ])('%s vira %s', (url, rotulo) => {
    expect(rotuloDoHost(url)).toBe(rotulo)
  })
})

describe('caminhoDaUrl', () => {
  it.each([
    ['http://localhost:3000/cadastro?x=1#topo', '/cadastro'],
    ['https://staging.app.dev/', '/'],
    [undefined, '/'],
    ['não é url', '/'],
  ])('%s vira %s', (url, caminho) => {
    expect(caminhoDaUrl(url)).toBe(caminho)
  })
})
