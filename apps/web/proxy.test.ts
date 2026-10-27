/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

// Sem VERCEL_ENV no Jest, o ambiente é dev: Votaí em votai.localhost:3333, site em localhost:3333.
function pedido(url: string, host = new URL(url).host) {
  return new NextRequest(url, { headers: { host } })
}

describe('proxy', () => {
  it('no host do Votaí, reescreve a raiz para a lista interna, sem redirecionar', () => {
    const res = proxy(pedido('http://votai.localhost:3333/'))
    expect(res.headers.get('x-middleware-rewrite')).toBe(
      'http://votai.localhost:3333/votacao',
    )
    expect(res.headers.get('location')).toBeNull()
  })

  it('reescreve a sessão e o histórico, preservando a query', () => {
    expect(
      proxy(pedido('http://votai.localhost:3333/12')).headers.get(
        'x-middleware-rewrite',
      ),
    ).toBe('http://votai.localhost:3333/votacao/12')
    expect(
      proxy(
        pedido('http://votai.localhost:3333/anteriores?page=2'),
      ).headers.get('x-middleware-rewrite'),
    ).toBe('http://votai.localhost:3333/votacao/anteriores?page=2')
  })

  it('o site manda /votacao/12 para o Votaí com 308', () => {
    const res = proxy(pedido('http://localhost:3333/votacao/12'))
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('http://votai.localhost:3333/12')
  })

  it('em dev, o resto do site no host do Votaí é 404 (sem loop de redirect)', () => {
    const res = proxy(pedido('http://votai.localhost:3333/posts/um'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-rewrite')).toBe(
      'http://votai.localhost:3333/_votai/fora-do-votai',
    )
  })

  it.each(['/api/admin/media/x.png', '/manifest.json', '/sitemap.xml'])(
    'em dev, %s no host do Votaí também é 404',
    (caminho) => {
      const res = proxy(pedido(`http://votai.localhost:3333${caminho}`))
      expect(res.headers.get('x-middleware-rewrite')).toBe(
        'http://votai.localhost:3333/_votai/fora-do-votai',
      )
    },
  )

  describe('em produção', () => {
    beforeAll(() => {
      process.env.VOTAI_AMBIENTE = 'production'
    })
    afterAll(() => {
      delete process.env.VOTAI_AMBIENTE
    })

    it.each(['/api/admin/media/x.png', '/manifest.json'])(
      '%s no Votaí vai para piluvitu.com.br com 308',
      (caminho) => {
        const res = proxy(pedido(`https://votai.piluvitu.com.br${caminho}`))
        expect(res.status).toBe(308)
        expect(res.headers.get('location')).toBe(
          `https://piluvitu.com.br${caminho}`,
        )
      },
    )

    it('o resto do site no Votaí vai para piluvitu.com.br com 308', () => {
      const res = proxy(pedido('https://votai.piluvitu.com.br/posts/um?x=1'))
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toBe(
        'https://piluvitu.com.br/posts/um?x=1',
      )
    })

    it('o Location nunca vem do host do pedido', () => {
      const res = proxy(
        pedido('https://piluvitu.com.br/votacao/12', 'piluvitu.com.br:8443'),
      )
      expect(res.headers.get('location')).toBe(
        'https://votai.piluvitu.com.br/12',
      )
    })

    it('a raiz do Votaí reescreve para a lista', () => {
      expect(
        proxy(pedido('https://votai.piluvitu.com.br/')).headers.get(
          'x-middleware-rewrite',
        ),
      ).toBe('https://votai.piluvitu.com.br/votacao')
    })

    it('localhost não é o Votaí em produção', () => {
      const res = proxy(pedido('http://votai.localhost:3333/'))
      expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    })
  })

  it('fora da votação, segue sem tocar', () => {
    const res = proxy(pedido('http://localhost:3333/posts'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})
