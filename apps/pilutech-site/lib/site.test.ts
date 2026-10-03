import { SITE_DE_PRODUCAO, urlAbsoluta, urlDoSite } from './site'

describe('urlDoSite', () => {
  it('sem SITE_URL, a produção', () => {
    expect(urlDoSite({})).toBe('https://pilutech.com.br')
  })

  // O preview já responde com X-Robots-Tag: noindex, e o canonical aponta para a produção.
  it('o host do preview da Vercel nunca vira canonical', () => {
    expect(
      urlDoSite({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'pilutech-site-git-x.vercel.app',
      }),
    ).toBe(SITE_DE_PRODUCAO)
  })

  it('SITE_URL vale como origem, sem a barra final', () => {
    expect(urlDoSite({ SITE_URL: 'http://localhost:3021/' })).toBe(
      'http://localhost:3021',
    )
  })

  it.each(['pilutech.local', 'ftp://pilutech.local', '   '])(
    'SITE_URL inválida (%p) cai na produção',
    (valor) => {
      expect(urlDoSite({ SITE_URL: valor })).toBe(SITE_DE_PRODUCAO)
    },
  )
})

describe('urlAbsoluta', () => {
  it('monta a URL a partir do site', () => {
    expect(urlAbsoluta('/', SITE_DE_PRODUCAO)).toBe('https://pilutech.com.br/')
    expect(urlAbsoluta('/sitemap.xml', SITE_DE_PRODUCAO)).toBe(
      'https://pilutech.com.br/sitemap.xml',
    )
  })
})
