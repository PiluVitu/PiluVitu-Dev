import {
  destinoDoHost,
  DOMINIO_PILUTECH,
  ehCaminhoIntocavel,
  rotearPorHost,
  subdominiosAtivos,
  urlPublica,
  type Pedido,
} from './pilutech-dominios'

function pedido(parcial: Partial<Pedido>): Pedido {
  return {
    host: 'piluvitu.com.br',
    caminho: '/',
    busca: '',
    subdominiosAtivos: false,
    ...parcial,
  }
}

describe('subdominiosAtivos', () => {
  it.each([
    ['1', true],
    [' 1 ', true],
    ['true', true],
    ['TRUE', true],
    ['0', false],
    ['false', false],
    ['', false],
    ['sim', false],
  ])('PILUTECH_SUBDOMINIOS=%p → %p', (valor, esperado) => {
    expect(subdominiosAtivos({ PILUTECH_SUBDOMINIOS: valor })).toBe(esperado)
  })

  // Padrão e em todo preview: sem a variável, nada muda.
  it('sem a variável, desligada', () => {
    expect(subdominiosAtivos({})).toBe(false)
  })

  // A Vercel marca os três ambientes ao criar a variável. Em preview, a chave
  // mandaria o /pilulabs* com 308 para a produção; em development (`vercel env
  // pull`), ligaria no next dev e derrubaria os E2E.
  it.each([
    ['preview', false],
    ['development', false],
    ['production', true],
  ])('PILUTECH_SUBDOMINIOS=1 com VERCEL_ENV=%p → %p', (vercelEnv, esperado) => {
    expect(
      subdominiosAtivos({ PILUTECH_SUBDOMINIOS: '1', VERCEL_ENV: vercelEnv }),
    ).toBe(esperado)
  })

  it('o domínio base é pilutech.com.br', () => {
    expect(DOMINIO_PILUTECH).toBe('pilutech.com.br')
  })
})

describe('destinoDoHost', () => {
  it.each([
    ['pilutech.com.br', { tipo: 'vitrine' }],
    ['www.pilutech.com.br', { tipo: 'vitrine' }],
    ['botai.pilutech.com.br', { tipo: 'item', slug: 'botai' }],
    ['live-prs.pilutech.com.br', { tipo: 'item', slug: 'live-prs' }],
    ['pilutech.localhost:3333', { tipo: 'vitrine' }],
    ['www.pilutech.localhost:3333', { tipo: 'vitrine' }],
    ['botai.pilutech.localhost:3333', { tipo: 'item', slug: 'botai' }],
    ['BOTAI.PiluTech.com.br:443', { tipo: 'item', slug: 'botai' }],
  ])('%s', (host, esperado) => {
    expect(destinoDoHost(host)).toEqual(esperado)
  })

  // Parecido com PiluTech não é PiluTech: nada disso pode ser reescrito.
  it.each([
    'piluvitu.com.br',
    'localhost:3333',
    'evilpilutech.com.br',
    'pilutech.com.br.evil.io',
    'a.b.pilutech.com.br',
    'bot_ai.pilutech.com.br',
    '-botai.pilutech.com.br',
    '',
  ])('%p não é host PiluTech', (host) => {
    expect(destinoDoHost(host)).toBeNull()
  })

  it('sem host, nada', () => {
    expect(destinoDoHost(null)).toBeNull()
  })
})

describe('ehCaminhoIntocavel', () => {
  it.each([
    '/_next/static/chunks/main.js',
    '/__nextjs_original-stack-frames',
    // Beacons do Vercel Analytics e do Speed Insights: sem extensão, e no
    // subdomínio virariam /pilulabs/<slug>/_vercel/… (404).
    '/_vercel/insights/view',
    '/_vercel/speed-insights/vitals',
    '/api/admin/stats',
    '/api',
    '/favicon.ico',
    '/pilulabs/botai/icone-128.png',
    '/pilulabs/botai/capturas/01-popup-escuro.png',
    '/pilulabs/opengraph-image-1a2b3c',
    '/pilulabs/botai/twitter-image-9z',
    '/pilulabs/botai/privacidade/opengraph-image',
  ])('%s', (caminho) => {
    expect(ehCaminhoIntocavel(caminho)).toBe(true)
  })

  it.each([
    '/',
    '/privacidade',
    '/pilulabs',
    '/pilulabs/botai',
    '/apis',
    '/tools',
  ])('%s não é', (caminho) => {
    expect(ehCaminhoIntocavel(caminho)).toBe(false)
  })
})

describe('urlPublica', () => {
  it('desligada, devolve o caminho como está', () => {
    expect(urlPublica('/pilulabs', false)).toBe('/pilulabs')
    expect(urlPublica('/pilulabs/botai', false)).toBe('/pilulabs/botai')
  })

  it.each([
    ['/pilulabs', 'https://pilutech.com.br/'],
    ['/pilulabs/', 'https://pilutech.com.br/'],
    ['/pilulabs/botai', 'https://botai.pilutech.com.br/'],
    ['/pilulabs/botai/', 'https://botai.pilutech.com.br/'],
    [
      '/pilulabs/botai/privacidade',
      'https://botai.pilutech.com.br/privacidade',
    ],
  ])('ligada: %s → %s', (caminho, esperado) => {
    expect(urlPublica(caminho, true)).toBe(esperado)
  })

  // Arquivos e imagens OG continuam no host de quem pediu (o og:image aponta
  // para o piluvitu.com.br); no subdomínio, /icone-128.png não existiria.
  // Slug que não serve de subdomínio também fica como está.
  it.each([
    '/pilulabs/botai/icone-128.png',
    '/pilulabs/botai/opengraph-image-1a2b3c',
    '/',
    '/tools',
    '/pilulabsx',
    '/pilulabs/Botai',
    '/pilulabs/www',
  ])('ligada, %s fica como está', (caminho) => {
    expect(urlPublica(caminho, true)).toBe(caminho)
  })
})

describe('rotearPorHost', () => {
  describe('no host PiluTech, com a chave ligada ou não', () => {
    it.each([false, true])('apex: / vira /pilulabs (chave %p)', (ligada) => {
      expect(
        rotearPorHost(
          pedido({ host: 'pilutech.com.br', subdominiosAtivos: ligada }),
        ),
      ).toEqual({ acao: 'reescrever', caminho: '/pilulabs' })
    })

    it('www: / vira /pilulabs', () => {
      expect(rotearPorHost(pedido({ host: 'www.pilutech.com.br' }))).toEqual({
        acao: 'reescrever',
        caminho: '/pilulabs',
      })
    })

    // Só a raiz do apex é a vitrine. O resto seria o portfólio inteiro em
    // pilutech.com.br, sem canonical: volta para o domínio do autor.
    it.each([false, true])(
      'apex: outro caminho vai com 308 para piluvitu.com.br, com a query (chave %p)',
      (ligada) => {
        expect(
          rotearPorHost(
            pedido({
              host: 'pilutech.com.br',
              caminho: '/posts/ola',
              busca: '?x=1',
              subdominiosAtivos: ligada,
            }),
          ),
        ).toEqual({
          acao: 'redirecionar',
          url: 'https://piluvitu.com.br/posts/ola?x=1',
        })
      },
    )

    it.each([
      '/pilulabs',
      '/pilulabs/botai/privacidade',
      '/favicon.ico',
      '/_vercel/insights/view',
    ])('apex: %s segue', (caminho) => {
      expect(
        rotearPorHost(pedido({ host: 'pilutech.com.br', caminho })),
      ).toEqual({ acao: 'seguir' })
    })

    it.each([
      ['/', '/pilulabs/botai'],
      ['/privacidade', '/pilulabs/botai/privacidade'],
      ['/privacidade/', '/pilulabs/botai/privacidade'],
    ])('subdomínio: %s → %s', (caminho, destino) => {
      expect(
        rotearPorHost(pedido({ host: 'botai.pilutech.com.br', caminho })),
      ).toEqual({ acao: 'reescrever', caminho: destino })
    })

    it('local: botai.pilutech.localhost:3333/privacidade → a política', () => {
      expect(
        rotearPorHost(
          pedido({
            host: 'botai.pilutech.localhost:3333',
            caminho: '/privacidade',
          }),
        ),
      ).toEqual({ acao: 'reescrever', caminho: '/pilulabs/botai/privacidade' })
    })

    it.each([
      '/_next/static/chunks/main.js',
      '/api/admin/stats',
      '/_vercel/insights/view',
      '/pilulabs',
      '/pilulabs/botai/privacidade',
      '/favicon.ico',
      '/pilulabs/botai/icone-128.png',
      '/opengraph-image-1a2b3c',
    ])('nunca reescreve %s', (caminho) => {
      expect(
        rotearPorHost(
          pedido({
            host: 'botai.pilutech.com.br',
            caminho,
            subdominiosAtivos: true,
          }),
        ),
      ).toEqual({ acao: 'seguir' })
    })
  })

  describe('fora do host PiluTech', () => {
    it.each(['/pilulabs', '/pilulabs/botai', '/tools', '/'])(
      'chave desligada: %s segue',
      (caminho) => {
        expect(rotearPorHost(pedido({ caminho }))).toEqual({ acao: 'seguir' })
      },
    )

    it.each([
      ['/pilulabs', 'https://pilutech.com.br/'],
      ['/pilulabs/', 'https://pilutech.com.br/'],
      ['/pilulabs/botai', 'https://botai.pilutech.com.br/'],
      [
        '/pilulabs/botai/privacidade',
        'https://botai.pilutech.com.br/privacidade',
      ],
    ])('chave ligada: %s → 308 para %s', (caminho, url) => {
      expect(
        rotearPorHost(pedido({ caminho, subdominiosAtivos: true })),
      ).toEqual({ acao: 'redirecionar', url })
    })

    // A spec pede o 308 genérico: um slug sem página ou sem DNS também vai, e o
    // 404 de hoje vira erro de DNS no navegador. Decisão registrada no plano.
    it('chave ligada: slug sem página nem subdomínio também vai com 308', () => {
      expect(
        rotearPorHost(
          pedido({ caminho: '/pilulabs/live-prs', subdominiosAtivos: true }),
        ),
      ).toEqual({
        acao: 'redirecionar',
        url: 'https://live-prs.pilutech.com.br/',
      })
    })

    it('chave ligada: preserva a query', () => {
      expect(
        rotearPorHost(
          pedido({
            caminho: '/pilulabs/botai',
            busca: '?utm_source=loja',
            subdominiosAtivos: true,
          }),
        ),
      ).toEqual({
        acao: 'redirecionar',
        url: 'https://botai.pilutech.com.br/?utm_source=loja',
      })
    })

    it.each([
      '/pilulabs/botai/icone-128.png',
      '/pilulabs/botai/opengraph-image-1a2b3c',
      '/pilulabs/twitter-image-9z',
      '/pilulabs/Botai',
      '/tools',
      '/',
    ])('chave ligada: %s segue', (caminho) => {
      expect(
        rotearPorHost(pedido({ caminho, subdominiosAtivos: true })),
      ).toEqual({ acao: 'seguir' })
    })
  })
})
