import {
  ehDataValida,
  ehHttps,
  ehUrlDaLoja,
  fase,
  LOJAS,
  lojasPublicadas,
  TIPO_PADRAO,
  TIPOS,
  urlsDasLojas,
} from './pilulabs'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'
const URL_EDGE = 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz'
const URL_OPERA = 'https://addons.opera.com/pt-br/extensions/details/botai/'

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
    expect(ehUrlDaLoja('chrome', ` ${URL_CHROME} `)).toBe(true)
    expect(ehUrlDaLoja('opera', URL_OPERA)).toBe(true)
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
    ['host de outra loja', URL_FIREFOX],
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

describe('lojasPublicadas', () => {
  it('sem URL nenhuma, nenhuma loja', () => {
    expect(lojasPublicadas(SEM_LOJA)).toEqual([])
  })

  it('aceita cada loja no host dela, na ordem fixa, seja qual for a ordem do YAML', () => {
    expect(
      lojasPublicadas({
        operaUrl: URL_OPERA,
        edgeUrl: URL_EDGE,
        firefoxUrl: URL_FIREFOX,
        chromeUrl: URL_CHROME,
      }),
    ).toEqual([
      { loja: 'chrome', url: URL_CHROME },
      { loja: 'firefox', url: URL_FIREFOX },
      { loja: 'edge', url: URL_EDGE },
      { loja: 'opera', url: URL_OPERA },
    ])
  })

  // As aprovações chegam em datas diferentes (o Opera pode levar meses).
  it('publica loja por loja', () => {
    expect(lojasPublicadas({ ...SEM_LOJA, firefoxUrl: URL_FIREFOX })).toEqual([
      { loja: 'firefox', url: URL_FIREFOX },
    ])
  })

  it('apara espaços antes de validar', () => {
    expect(
      lojasPublicadas({ ...SEM_LOJA, chromeUrl: `  ${URL_CHROME}\n` }),
    ).toEqual([{ loja: 'chrome', url: URL_CHROME }])
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
    ['host de outra loja', URL_FIREFOX],
    ['sem esquema', 'chromewebstore.google.com/detail/botai/abc'],
    ['javascript:', 'javascript:alert(1)'],
  ])('recusa na Chrome Web Store: %s', (_caso, url) => {
    expect(lojasPublicadas({ ...SEM_LOJA, chromeUrl: url })).toEqual([])
  })
})

describe('fase', () => {
  it('em-breve sem loja publicada', () => {
    expect(fase(SEM_LOJA)).toBe('em-breve')
  })

  it('disponivel com uma loja publicada', () => {
    expect(fase({ ...SEM_LOJA, edgeUrl: URL_EDGE })).toBe('disponivel')
  })

  it('URL de host errado não conta como publicada', () => {
    expect(fase({ ...SEM_LOJA, chromeUrl: 'https://example.com/botai' })).toBe(
      'em-breve',
    )
  })
})

describe('urlsDasLojas', () => {
  it('as 4 URLs do item, aparadas, sem o resto do YAML', () => {
    expect(
      urlsDasLojas({
        slug: 'botai',
        nome: 'Botaí',
        chromeUrl: ` ${URL_CHROME} `,
        firefoxUrl: '',
        edgeUrl: URL_EDGE,
        operaUrl: '',
      }),
    ).toEqual({ ...SEM_LOJA, chromeUrl: URL_CHROME, edgeUrl: URL_EDGE })
  })

  // O Keystatic apaga do YAML o campo opcional vazio, e o yaml lê chave sem valor como null.
  it('campo ausente, nulo ou que não é texto vira vazio', () => {
    expect(
      urlsDasLojas({ chromeUrl: 12, firefoxUrl: null, edgeUrl: ['a'] }),
    ).toEqual(SEM_LOJA)
  })

  it.each([[null], [undefined], [''], ['texto'], [42], [[]]])(
    'YAML que não é um objeto (%p): nenhuma loja',
    (bruto) => {
      expect(urlsDasLojas(bruto)).toEqual(SEM_LOJA)
    },
  )
})

// O atalho da extensão mora no @pilutech/botai-core/atalhos, no repo do Botaí.
describe('o que o módulo exporta', () => {
  it('só as regras do catálogo e das lojas', async () => {
    expect(Object.keys(await import('./pilulabs')).sort()).toEqual([
      'LOJAS',
      'TIPOS',
      'TIPO_PADRAO',
      'ehDataValida',
      'ehHttps',
      'ehUrlDaLoja',
      'fase',
      'lojasPublicadas',
      'urlsDasLojas',
    ])
  })
})
