import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  altDaCaptura,
  ATALHOS,
  fase,
  listarCapturas,
  LOJAS,
  lojasPublicadas,
  metadataDaPagina,
  metadataDoProduto,
  normalizarProduto,
  produtoParaProject,
  produtosListados,
  ROTULOS_CAPTURA,
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

describe('listarCapturas', () => {
  let raiz: string

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), 'pilulabs-'))
  })
  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true })
  })

  function criarCapturas(...arquivos: string[]): string {
    const pasta = join(raiz, 'pilulabs', 'botai', 'capturas')
    mkdirSync(pasta, { recursive: true })
    for (const arquivo of arquivos) writeFileSync(join(pasta, arquivo), '')
    return pasta
  }

  // Na fase 2 as capturas ainda não existem: a página tem de nascer sem elas.
  it('devolve [] quando a pasta não existe', () => {
    expect(listarCapturas('botai', raiz)).toEqual([])
  })

  it('lista só arquivos PNG, em ordem natural do prefixo NN', () => {
    const pasta = criarCapturas(
      '10-c.png',
      '2-b.png',
      '01-a.png',
      '03-d.PNG',
      '.DS_Store',
      'notas.txt',
    )
    mkdirSync(join(pasta, '04-pasta.png'))
    expect(listarCapturas('botai', raiz).map((c) => c.arquivo)).toEqual([
      '01-a.png',
      '2-b.png',
      '03-d.PNG',
      '10-c.png',
    ])
  })

  it('monta o src público a partir do slug', () => {
    criarCapturas('01-popup-escuro.png')
    expect(listarCapturas('botai', raiz)).toEqual([
      {
        arquivo: '01-popup-escuro.png',
        src: '/pilulabs/botai/capturas/01-popup-escuro.png',
        alt: 'Captura de tela: popup (tema escuro)',
      },
    ])
  })
})

describe('altDaCaptura', () => {
  it('tira o NN e a extensão, devolve o acento e o tema pelo mapa de rótulos', () => {
    expect(altDaCaptura('01-pagina-preenchida-escuro.png')).toBe(
      'Captura de tela: página preenchida (tema escuro)',
    )
  })

  it('palavra fora do mapa entra como está, em minúscula', () => {
    expect(altDaCaptura('02-Popup-pessoa-pronta-claro.png')).toBe(
      'Captura de tela: popup pessoa pronta (tema claro)',
    )
  })

  // Com um objeto comum, "constructor" acharia Object.prototype.constructor.
  it('palavra com nome de propriedade de Object não vira lixo', () => {
    expect(altDaCaptura('03-constructor.png')).toBe(
      'Captura de tela: constructor',
    )
  })

  it('o mapa cobre os temas claro e escuro', () => {
    expect(ROTULOS_CAPTURA.get('claro')).toBe('(tema claro)')
    expect(ROTULOS_CAPTURA.get('escuro')).toBe('(tema escuro)')
  })
})

describe('ATALHOS', () => {
  it('Chromium: Ctrl+Shift+Y no Windows e no Linux, ⌥⇧P no Mac', () => {
    for (const navegador of ['chrome', 'edge', 'opera'] as const) {
      expect(ATALHOS[navegador]).toEqual({
        windows: 'Ctrl+Shift+Y',
        mac: '⌥⇧P',
        linux: 'Ctrl+Shift+Y',
      })
    }
  })

  // No Firefox para Linux, Ctrl+Shift+Y abre os Downloads e não é cedido.
  it('Firefox: igual, mas Alt+Shift+P no Linux', () => {
    expect(ATALHOS.firefox).toEqual({
      windows: 'Ctrl+Shift+Y',
      mac: '⌥⇧P',
      linux: 'Alt+Shift+P',
    })
  })

  it('cobre as 4 lojas', () => {
    expect(Object.keys(ATALHOS).sort()).toEqual([...LOJAS].sort())
  })
})

const PAGINA = {
  caminho: '/pilulabs/botai',
  titulo: 'Botaí | PiluLabs',
  descricao: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
}

describe('metadataDaPagina', () => {
  // O Next substitui o openGraph do layout inteiro: locale e siteName têm de
  // vir de novo, senão a página perde os dois.
  it('declara título absoluto, canonical, openGraph e twitter completos', () => {
    expect(metadataDaPagina(PAGINA)).toEqual({
      title: { absolute: 'Botaí | PiluLabs' },
      description: PAGINA.descricao,
      alternates: { canonical: '/pilulabs/botai' },
      openGraph: {
        type: 'website',
        locale: 'pt_BR',
        siteName: 'piluvitu.com.br',
        url: '/pilulabs/botai',
        title: 'Botaí | PiluLabs',
        description: PAGINA.descricao,
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Botaí | PiluLabs',
        description: PAGINA.descricao,
      },
    })
  })

  // Declarar images aqui desligaria o opengraph-image.tsx do segmento.
  it('não declara imagens', () => {
    const metadata = metadataDaPagina(PAGINA)
    expect(metadata.openGraph).not.toHaveProperty('images')
    expect(metadata.twitter).not.toHaveProperty('images')
  })
})

describe('metadataDoProduto', () => {
  it('produto não listado: noindex', () => {
    expect(metadataDoProduto({ listado: false }, PAGINA).robots).toEqual({
      index: false,
    })
  })

  it('produto listado: sem robots, igual à metadata da página', () => {
    expect(metadataDoProduto({ listado: true }, PAGINA)).toEqual(
      metadataDaPagina(PAGINA),
    )
  })
})

describe('produtoParaProject', () => {
  it('vira um card de Projetos que leva à página do produto', () => {
    expect(
      produtoParaProject(
        produto({
          repoLink:
            'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai',
        }),
      ),
    ).toEqual({
      id: 'pilulabs-botai',
      projectName: 'Botaí',
      subtitle: 'PiluLabs · Powered by PiluTech',
      projectLogo: '/pilulabs/botai/icone-128.png',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      tags: ['QA'],
      deployLink: '/pilulabs/botai',
      deployLabel: 'Ver no PiluLabs',
      repoLink: 'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai',
      image: '/pilulabs/botai/icone-128.png',
      altImage: 'BO',
    })
  })

  it('sem ícone, sem imagem', () => {
    expect(produtoParaProject(produto({ icone: '' })).image).toBeUndefined()
  })
})
