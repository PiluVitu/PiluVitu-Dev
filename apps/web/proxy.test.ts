/** @jest-environment node */
import { NextRequest } from 'next/server'
import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from 'next/experimental/testing/server'
import { config, proxy } from './proxy'

// No Next 16.3.8 o utilitário ainda se chama unstable_doesMiddlewareMatch: a
// doc empacotada fala em unstable_doesProxyMatch, que não existe nesta versão.
const roda = (url: string) => unstable_doesMiddlewareMatch({ config, url })

afterEach(() => {
  delete process.env.PILUTECH_SUBDOMINIOS
  delete process.env.VERCEL_ENV
})

describe('config.matcher', () => {
  it.each([
    'https://pilutech.com.br/',
    'https://www.pilutech.com.br/',
    'https://pilutech.com.br/tools',
    'https://botai.pilutech.com.br/privacidade',
    'https://BOTAI.PiluTech.com.br/',
    'http://botai.pilutech.localhost:3333/',
    'https://piluvitu.com.br/pilulabs',
    'https://piluvitu.com.br/pilulabs/',
    'https://piluvitu.com.br/pilulabs/botai/privacidade',
  ])('roda em %s', (url) => {
    expect(roda(url)).toBe(true)
  })

  // O resto do piluvitu.com.br não paga o proxy, nem os estáticos no host PiluTech.
  it.each([
    'https://piluvitu.com.br/',
    'https://piluvitu.com.br/tools',
    'https://piluvitu.com.br/pilulabsx',
    'https://botai.pilutech.com.br/_next/static/chunks/main.js',
    'https://botai.pilutech.com.br/api/admin/stats',
    'https://botai.pilutech.com.br/_vercel/insights/view',
    'https://evilpilutech.com.br/',
    'https://pilutech.com.br.evil.io/',
    'https://a.b.pilutech.com.br/',
  ])('não roda em %s', (url) => {
    expect(roda(url)).toBe(false)
  })
})

describe('proxy', () => {
  it('reescreve o subdomínio para a rota do item, com a query', () => {
    const resposta = proxy(
      new NextRequest('http://botai.pilutech.localhost:3333/privacidade?x=1'),
    )
    expect(isRewrite(resposta)).toBe(true)
    expect(getRewrittenUrl(resposta)).toBe(
      'http://botai.pilutech.localhost:3333/pilulabs/botai/privacidade?x=1',
    )
  })

  it('o apex vira a vitrine', () => {
    expect(
      getRewrittenUrl(proxy(new NextRequest('https://pilutech.com.br/'))),
    ).toBe('https://pilutech.com.br/pilulabs')
  })

  it('o apex fora da raiz volta com 308 para piluvitu.com.br, com a query', () => {
    const resposta = proxy(new NextRequest('https://pilutech.com.br/tools?x=1'))
    expect(resposta.status).toBe(308)
    expect(getRedirectUrl(resposta)).toBe('https://piluvitu.com.br/tools?x=1')
  })

  it('vale o header host, quando ele vem', () => {
    const resposta = proxy(
      new NextRequest('https://x.vercel.app/', {
        headers: { host: 'botai.pilutech.com.br' },
      }),
    )
    expect(getRewrittenUrl(resposta)).toBe(
      'https://x.vercel.app/pilulabs/botai',
    )
  })

  it('chave desligada: /pilulabs/botai em piluvitu.com.br segue, sem 308', () => {
    const resposta = proxy(
      new NextRequest('https://piluvitu.com.br/pilulabs/botai'),
    )
    expect(isRewrite(resposta)).toBe(false)
    expect(getRedirectUrl(resposta)).toBeNull()
  })

  it('chave ligada: 308 para o subdomínio, com a query', () => {
    process.env.PILUTECH_SUBDOMINIOS = '1'
    const resposta = proxy(
      new NextRequest(
        'https://piluvitu.com.br/pilulabs/botai/privacidade?utm_source=loja',
      ),
    )
    expect(resposta.status).toBe(308)
    expect(getRedirectUrl(resposta)).toBe(
      'https://botai.pilutech.com.br/privacidade?utm_source=loja',
    )
  })

  // Num preview, a variável marcada em todos os ambientes não liga o 308.
  it('chave ligada fora de Production: segue, sem 308', () => {
    process.env.PILUTECH_SUBDOMINIOS = '1'
    process.env.VERCEL_ENV = 'preview'
    const resposta = proxy(
      new NextRequest('https://piluvitu-git-x.vercel.app/pilulabs/botai'),
    )
    expect(getRedirectUrl(resposta)).toBeNull()
    expect(isRewrite(resposta)).toBe(false)
  })

  it('chave ligada: a imagem OG continua servida no piluvitu.com.br', () => {
    process.env.PILUTECH_SUBDOMINIOS = '1'
    const resposta = proxy(
      new NextRequest(
        'https://piluvitu.com.br/pilulabs/botai/opengraph-image-1a2b3c',
      ),
    )
    expect(getRedirectUrl(resposta)).toBeNull()
    expect(isRewrite(resposta)).toBe(false)
  })

  it('chave ligada: no host PiluTech, /pilulabs/botai não redireciona', () => {
    process.env.PILUTECH_SUBDOMINIOS = '1'
    const resposta = proxy(
      new NextRequest('https://botai.pilutech.com.br/pilulabs/botai'),
    )
    expect(getRedirectUrl(resposta)).toBeNull()
    expect(isRewrite(resposta)).toBe(false)
  })
})
