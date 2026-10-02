import {
  ehDataValida,
  ehHttps,
  ehUrlDaLoja,
  LOJAS,
  TIPO_PADRAO,
  TIPOS,
} from './pilulabs-regras'

describe('LOJAS e TIPOS', () => {
  it('as lojas em ordem fixa: chrome, firefox, edge, opera', () => {
    expect(LOJAS).toEqual(['chrome', 'firefox', 'edge', 'opera'])
  })

  // A vitrine agrupa nessa ordem: Extensões, Apps mobile, Apps web, CLIs.
  it('os tipos em ordem: extensao, mobile, web, cli', () => {
    expect(TIPOS).toEqual(['extensao', 'mobile', 'web', 'cli'])
  })

  // Sem status nem loja: o padrão mais neutro para um tipo ausente.
  it('o tipo padrão é web', () => {
    expect(TIPO_PADRAO).toBe('web')
  })
})

describe('ehUrlDaLoja', () => {
  it('aceita a URL https no host exato da loja, com espaços em volta', () => {
    expect(
      ehUrlDaLoja(
        'chrome',
        ' https://chromewebstore.google.com/detail/botai/abc ',
      ),
    ).toBe(true)
    expect(
      ehUrlDaLoja(
        'opera',
        'https://addons.opera.com/pt-br/extensions/details/botai/',
      ),
    ).toBe(true)
  })

  it.each([
    [
      'http em vez de https',
      'http://chromewebstore.google.com/detail/botai/abc',
    ],
    [
      'host com sufixo',
      'https://chromewebstore.google.com.evil.io/detail/botai/abc',
    ],
    ['subdomínio', 'https://www.chromewebstore.google.com/detail/botai/abc'],
    [
      'host de outra loja',
      'https://addons.mozilla.org/pt-BR/firefox/addon/botai/',
    ],
    ['sem esquema', 'chromewebstore.google.com/detail/botai/abc'],
    ['javascript:', 'javascript:alert(1)'],
    ['vazio', ''],
  ])('recusa na Chrome Web Store: %s', (_caso, url) => {
    expect(ehUrlDaLoja('chrome', url)).toBe(false)
  })
})

describe('ehHttps', () => {
  it('aceita https e recusa o resto', () => {
    expect(ehHttps('https://sombrai.pilutech.com.br')).toBe(true)
    expect(ehHttps(' https://sombrai.pilutech.com.br ')).toBe(true)
    expect(ehHttps('http://sombrai.pilutech.com.br')).toBe(false)
    expect(ehHttps('javascript:alert(1)')).toBe(false)
    expect(ehHttps('sombrai.pilutech.com.br')).toBe(false)
    expect(ehHttps('')).toBe(false)
  })
})

describe('ehDataValida', () => {
  it('aceita AAAA-MM-DD de um dia que existe', () => {
    expect(ehDataValida('2026-10-01')).toBe(true)
    expect(ehDataValida('2024-02-29')).toBe(true)
  })

  it.each([
    '',
    '2026-13-01',
    '2026-02-30',
    '2025-02-29',
    '01/10/2026',
    '2026-1-1',
    '2026-10-01T00:00',
  ])('recusa %p', (valor) => {
    expect(ehDataValida(valor)).toBe(false)
  })
})
