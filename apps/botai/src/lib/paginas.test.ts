import { describe, expect, it } from 'vitest'
import {
  caminhoDaUrl,
  erroEhPaginaProibida,
  rotuloDoHost,
  situacaoDaUrl,
} from './paginas'

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
  ])('%s é proibida pela própria URL, sem injetar nada', (url) => {
    expect(situacaoDaUrl(url, true)).toBe('proibida')
  })

  it.each([
    'http://localhost:3000/cadastro',
    'https://staging.app.dev/conta',
    'https://chrome.google.com/search',
  ])('%s é uma página comum', (url) => {
    expect(situacaoDaUrl(url, false)).toBe('ok')
  })

  it('file: depende do "Permitir acesso a URLs de arquivo"', () => {
    expect(situacaoDaUrl('file:///Users/eu/form.html', false)).toBe(
      'arquivo-sem-acesso',
    )
    expect(situacaoDaUrl('file:///Users/eu/form.html', true)).toBe('ok')
  })

  it('sem URL (aba sem permissão concedida) deixa tentar', () => {
    expect(situacaoDaUrl(undefined, false)).toBe('ok')
  })
})

describe('erroEhPaginaProibida', () => {
  it.each([
    'Cannot access a chrome:// URL',
    'The extensions gallery cannot be scripted.',
    'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    'Cannot access contents of url "file:///tmp/a.html". Extension manifest must request permission to access this host.',
    'Cannot access a chrome-extension:// URL of different extension',
  ])('reconhece a recusa do Chrome: %s', (mensagem) => {
    expect(erroEhPaginaProibida(mensagem)).toBe(true)
  })

  it.each([
    'No tab with id: 7.',
    'Frame with ID 0 was removed.',
    'Could not establish connection.',
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
