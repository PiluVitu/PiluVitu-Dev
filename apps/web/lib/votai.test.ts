import {
  ambienteVotai,
  baseDaVotacao,
  caminhoInterno,
  caminhoNaBase,
  caminhoNoVotai,
  decidirRota,
  destinoDoLogin,
  ehHostDoVotai,
  origemDoVotai,
  urlDaSessao,
  urlDoSite,
  urlDoVotai,
} from './votai'

const pedido = (hostname: string, pathname: string, search = '') => ({
  hostname,
  pathname,
  search,
})

describe('ambienteVotai', () => {
  it.each([
    ['production', 'producao'],
    ['preview', 'preview'],
    ['development', 'dev'],
    ['', 'dev'],
    [undefined, 'dev'],
  ])('VERCEL_ENV=%s → %s', (vercelEnv, esperado) => {
    expect(ambienteVotai(vercelEnv)).toBe(esperado)
  })
})

describe('origens fixas em código', () => {
  it('produção e dev têm o host do Votaí; o preview não tem', () => {
    expect(origemDoVotai('producao')).toBe('https://votai.piluvitu.com.br')
    expect(origemDoVotai('dev')).toBe('http://votai.localhost:3333')
    expect(origemDoVotai('preview')).toBeNull()
  })

  it.each([
    ['votai.piluvitu.com.br', 'producao', true],
    ['VOTAI.piluvitu.com.br', 'producao', true],
    ['piluvitu.com.br', 'producao', false],
    ['votai.localhost', 'producao', false],
    ['votai.piluvitu.com.br.evil.com', 'producao', false],
    ['votai.localhost', 'dev', true],
    ['localhost', 'dev', false],
    ['votai.piluvitu.com.br', 'preview', false],
  ] as const)('%s em %s → %s', (hostname, ambiente, esperado) => {
    expect(ehHostDoVotai(hostname, ambiente)).toBe(esperado)
  })
})

describe('base dos links da votação', () => {
  it('na raiz do host do Votaí, em /votacao no site e no preview', () => {
    expect(baseDaVotacao('votai.piluvitu.com.br', 'producao')).toBe('')
    expect(baseDaVotacao('votai.localhost', 'dev')).toBe('')
    expect(baseDaVotacao('piluvitu.com.br', 'producao')).toBe('/votacao')
    expect(baseDaVotacao('pilu-vitu-dev-git-x.vercel.app', 'preview')).toBe(
      '/votacao',
    )
  })

  it('caminhoNaBase monta os dois esquemas', () => {
    expect(caminhoNaBase('', '')).toBe('/')
    expect(caminhoNaBase('', '/12')).toBe('/12')
    expect(caminhoNaBase('/votacao', '')).toBe('/votacao')
    expect(caminhoNaBase('/votacao', '/anteriores/3')).toBe(
      '/votacao/anteriores/3',
    )
  })
})

describe('URLs absolutas', () => {
  it('a sessão aponta para o Votaí; no preview, para /votacao', () => {
    expect(urlDaSessao(12, 'producao')).toBe('https://votai.piluvitu.com.br/12')
    expect(urlDaSessao(12, 'dev')).toBe('http://votai.localhost:3333/12')
    expect(urlDaSessao(12, 'preview')).toBe('/votacao/12')
    expect(urlDoVotai('/', 'preview')).toBe('/votacao')
    expect(urlDoVotai('/', 'producao')).toBe('https://votai.piluvitu.com.br/')
  })

  it('o site também é fixo', () => {
    expect(urlDoSite('/admin/sessoes', 'producao')).toBe(
      'https://piluvitu.com.br/admin/sessoes',
    )
    expect(urlDoSite('/admin/sessoes', 'dev')).toBe(
      'http://localhost:3333/admin/sessoes',
    )
    expect(urlDoSite('/admin/sessoes', 'preview')).toBe('/admin/sessoes')
  })
})

describe('destinoDoLogin', () => {
  const local = (href: string) => {
    const u = new URL(href)
    return {
      href: u.href,
      hostname: u.hostname,
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
    }
  }

  it('no Votaí, é a origem fixa + o caminho atual', () => {
    expect(
      destinoDoLogin(
        local('https://votai.piluvitu.com.br/12?x=1#topo'),
        'producao',
      ),
    ).toBe('https://votai.piluvitu.com.br/12?x=1#topo')
  })

  it('não usa a origem do pedido: a porta e o esquema vêm do código', () => {
    expect(destinoDoLogin(local('http://votai.localhost:9999/12'), 'dev')).toBe(
      'http://votai.localhost:3333/12',
    )
  })

  it('fora do Votaí (admin no site, preview), é a página atual absoluta', () => {
    expect(
      destinoDoLogin(local('https://piluvitu.com.br/admin'), 'producao'),
    ).toBe('https://piluvitu.com.br/admin')
    expect(
      destinoDoLogin(local('https://x.vercel.app/votacao/3'), 'preview'),
    ).toBe('https://x.vercel.app/votacao/3')
  })
})

describe('tradução de caminhos', () => {
  it.each([
    ['/', '/votacao'],
    ['/12', '/votacao/12'],
    ['/anteriores', '/votacao/anteriores'],
    ['/anteriores/7', '/votacao/anteriores/7'],
    ['/0', null],
    ['/12a', null],
    ['/anteriores/x', null],
    ['/posts', null],
    ['/votacao', null],
  ])('Votaí %s → interno %s', (caminho, esperado) => {
    expect(caminhoInterno(caminho)).toBe(esperado)
  })

  it.each([
    ['/votacao', '/'],
    ['/votacao/12', '/12'],
    ['/votacao/anteriores', '/anteriores'],
    ['/votacao/anteriores/7', '/anteriores/7'],
    ['/votacao/admin', null],
    ['/votacao/abc', null],
    ['/votacao/opengraph-image', null],
    ['/votacao-velha', null],
  ])('interno %s → Votaí %s', (caminho, esperado) => {
    expect(caminhoNoVotai(caminho)).toBe(esperado)
  })
})

describe('decidirRota no host do Votaí (produção)', () => {
  const votai = (pathname: string, search = '') =>
    decidirRota(pedido('votai.piluvitu.com.br', pathname, search), 'producao')

  it.each([
    ['/', '/votacao'],
    ['/12', '/votacao/12'],
    ['/anteriores', '/votacao/anteriores'],
    ['/anteriores/3', '/votacao/anteriores/3'],
  ])('reescreve %s para %s', (caminho, interno) => {
    expect(votai(caminho)).toEqual({ tipo: 'reescrever', caminho: interno })
  })

  it.each([
    '/_next/static/chunks/a.js',
    '/_next/data/x.json',
    '/favicon.ico',
    '/opengraph-image',
    '/opengraph-image-1a2b3c',
    '/twitter-image',
  ])('deixa passar o recurso %s', (caminho) => {
    expect(votai(caminho)).toEqual({ tipo: 'seguir' })
  })

  // Extensão no fim do caminho não é sinal de recurso do Votaí: os handlers de admin e as páginas
  // do site aceitam qualquer nome.
  it.each([
    '/api/admin/media/foto.png',
    '/api/admin/posts/meu.post',
    '/api/admin/content/posts/um.yaml',
    '/posts/a.b',
    '/sitemap.xml',
    '/robots.txt',
    '/manifest.json',
    '/sw.js',
    '/profile-2.jpg',
    '/a1b2c3/script.js',
    '//evil.com',
  ])(
    '%s com extensão não escapa do Votaí: vai para piluvitu.com.br',
    (caminho) => {
      expect(votai(caminho)).toEqual({
        tipo: 'redirecionar',
        url: `https://piluvitu.com.br${caminho}`,
      })
    },
  )

  it('o caminho antigo dentro do Votaí vira o caminho novo, com a query', () => {
    expect(votai('/votacao/12', '?a=1')).toEqual({
      tipo: 'redirecionar',
      url: 'https://votai.piluvitu.com.br/12?a=1',
    })
  })

  it.each(['/posts', '/admin/sessoes', '/votacao/admin', '/api/x', '/tools'])(
    'o resto do site (%s) vai para piluvitu.com.br, mesmo caminho',
    (caminho) => {
      expect(votai(caminho, '?q=1')).toEqual({
        tipo: 'redirecionar',
        url: `https://piluvitu.com.br${caminho}?q=1`,
      })
    },
  )
})

describe('decidirRota no site (produção)', () => {
  const site = (pathname: string, search = '') =>
    decidirRota(pedido('piluvitu.com.br', pathname, search), 'producao')

  it.each([
    ['/votacao', 'https://votai.piluvitu.com.br/'],
    ['/votacao/12', 'https://votai.piluvitu.com.br/12'],
    ['/votacao/anteriores', 'https://votai.piluvitu.com.br/anteriores'],
    ['/votacao/anteriores/4', 'https://votai.piluvitu.com.br/anteriores/4'],
  ])('%s vai para %s', (caminho, url) => {
    expect(site(caminho)).toEqual({ tipo: 'redirecionar', url })
  })

  it('preserva a query', () => {
    expect(site('/votacao/12', '?x=1')).toEqual({
      tipo: 'redirecionar',
      url: 'https://votai.piluvitu.com.br/12?x=1',
    })
  })

  it.each(['/', '/votacao/admin', '/admin/sessoes', '/posts/a', '/12'])(
    'não mexe em %s',
    (caminho) => {
      expect(site(caminho)).toEqual({ tipo: 'seguir' })
    },
  )
})

describe('decidirRota em dev e no preview', () => {
  it('em dev, localhost redireciona para votai.localhost:3333', () => {
    expect(decidirRota(pedido('localhost', '/votacao/12'), 'dev')).toEqual({
      tipo: 'redirecionar',
      url: 'http://votai.localhost:3333/12',
    })
    expect(decidirRota(pedido('votai.localhost', '/'), 'dev')).toEqual({
      tipo: 'reescrever',
      caminho: '/votacao',
    })
    // O next dev devolve relativo um Location para o loopback, então o resto do site no Votaí de
    // dev é 404 em vez de 308 (que viraria loop); a produção redireciona.
    expect(decidirRota(pedido('votai.localhost', '/posts'), 'dev')).toEqual({
      tipo: 'nao-encontrado',
    })
  })

  it('no preview não há host do Votaí: tudo segue, /votacao inclusive', () => {
    for (const caminho of ['/votacao', '/votacao/12', '/', '/posts'])
      expect(
        decidirRota(
          pedido('pilu-vitu-dev-git-x.vercel.app', caminho),
          'preview',
        ),
      ).toEqual({ tipo: 'seguir' })
    expect(
      decidirRota(pedido('votai.piluvitu.com.br', '/'), 'preview'),
    ).toEqual({ tipo: 'seguir' })
  })

  it('o host de dev não vale em produção', () => {
    expect(decidirRota(pedido('votai.localhost', '/'), 'producao')).toEqual({
      tipo: 'seguir',
    })
  })
})
