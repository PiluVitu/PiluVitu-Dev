import {
  fase,
  LOJAS,
  lojasPublicadas,
  normalizarProduto,
  produtosListados,
  type Produto,
} from './pilulabs'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'
const URL_EDGE = 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz'
const URL_OPERA = 'https://addons.opera.com/pt-br/extensions/details/botai/'

function produto(parcial: Partial<Produto> = {}): Produto {
  return {
    slug: 'botai',
    order: 0,
    nome: 'Botaí',
    tipo: 'extensao',
    listado: false,
    resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    icone: '/pilulabs/botai/icone-128.png',
    tags: ['QA'],
    ...SEM_LOJA,
    repoLink: '',
    ...parcial,
  }
}

describe('normalizarProduto', () => {
  it('lê a entrada completa do YAML, aparando espaços', () => {
    expect(
      normalizarProduto('botai', {
        order: 2,
        nome: ' Botaí ',
        tipo: 'extensao',
        listado: true,
        resumo: 'r',
        icone: '/i.png',
        tags: ['A', ' B '],
        chromeUrl: ` ${URL_CHROME} `,
        firefoxUrl: '',
        edgeUrl: '',
        operaUrl: '',
        repoLink: 'https://github.com/x',
      }),
    ).toEqual({
      slug: 'botai',
      order: 2,
      nome: 'Botaí',
      tipo: 'extensao',
      listado: true,
      resumo: 'r',
      icone: '/i.png',
      tags: ['A', 'B'],
      chromeUrl: URL_CHROME,
      firefoxUrl: '',
      edgeUrl: '',
      operaUrl: '',
      repoLink: 'https://github.com/x',
    })
  })

  // O Keystatic apaga do YAML o campo opcional vazio. Um produto sem `listado`
  // tem de cair em "não listado" (noindex), nunca em listado nem em exceção.
  it('campo omitido vira o vazio do tipo, e sem listado o produto não é listado', () => {
    expect(normalizarProduto('novo', {})).toEqual({
      slug: 'novo',
      order: 0,
      nome: 'novo',
      tipo: 'extensao',
      listado: false,
      resumo: '',
      icone: '',
      tags: [],
      ...SEM_LOJA,
      repoLink: '',
    })
  })

  it('order nulo vira 0, e tipo desconhecido vira extensao', () => {
    const p = normalizarProduto('x', { order: null, tipo: 'desktop' })
    expect(p.order).toBe(0)
    expect(p.tipo).toBe('extensao')
  })

  it('tags nulas (YAML com "tags:" vazio) viram lista vazia', () => {
    expect(normalizarProduto('x', { tags: null }).tags).toEqual([])
  })

  it('só o booleano true lista; a string "true" não', () => {
    expect(
      normalizarProduto('x', { listado: 'true' as unknown as boolean }).listado,
    ).toBe(false)
  })
})

describe('lojasPublicadas', () => {
  it('a ordem fixa das lojas é chrome, firefox, edge, opera', () => {
    expect(LOJAS).toEqual(['chrome', 'firefox', 'edge', 'opera'])
  })

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
    expect(fase(produto())).toBe('em-breve')
  })

  it('disponivel com uma loja publicada', () => {
    expect(fase(produto({ edgeUrl: URL_EDGE }))).toBe('disponivel')
  })

  it('URL de host errado não conta como publicada', () => {
    expect(fase(produto({ chromeUrl: 'https://example.com/botai' }))).toBe(
      'em-breve',
    )
  })
})

describe('produtosListados', () => {
  it('fica só com os listados, na ordem recebida', () => {
    const a = produto({ slug: 'a', listado: true })
    const b = produto({ slug: 'b', listado: false })
    const c = produto({ slug: 'c', listado: true })
    expect(produtosListados([a, b, c]).map((p) => p.slug)).toEqual(['a', 'c'])
  })
})
