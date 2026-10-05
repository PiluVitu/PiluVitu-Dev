import {
  COR_DO_TEMA,
  DESCRICAO_DA_HOME,
  metadataDaPagina,
  metadataDoSite,
  TITULO_DA_HOME,
  VIEWPORT,
} from './seo'
import { hslParaHex, tokenDoDs } from './tokens-do-ds'

const SITE = 'https://pilutech.com.br'

describe('textos de busca', () => {
  // A spec pede até 60 caracteres.
  it('título: até 60 caracteres, com o foco em infraestrutura e IA', () => {
    expect(TITULO_DA_HOME).toBe(
      'PiluTech · Infraestrutura, IA e desenvolvimento de software',
    )
    expect(TITULO_DA_HOME.length).toBeLessThanOrEqual(60)
  })

  // O texto pedido tinha 167 caracteres; sem o "em nuvem" cabe no limite e mantém os quatro serviços.
  it('descrição: 140–160 caracteres, o que a PiluTech faz, na ordem do foco, e onde', () => {
    expect(DESCRICAO_DA_HOME).toBe(
      'Infraestrutura, implementação de IA sob medida e desenvolvimento de aplicativos e sistemas. A PiluTech fica em Teresina (PI) e atende remoto em todo o Brasil.',
    )
    expect(DESCRICAO_DA_HOME.length).toBeGreaterThanOrEqual(140)
    expect(DESCRICAO_DA_HOME.length).toBeLessThanOrEqual(160)
    for (const termo of [
      'Infraestrutura',
      'implementação de IA sob medida',
      'aplicativos e sistemas',
      'Teresina (PI)',
      'remoto',
      'todo o Brasil',
    ])
      expect(DESCRICAO_DA_HOME).toContain(termo)
  })

  it('regras da marca: sem computadores e impressoras, sem emoji', () => {
    for (const texto of [TITULO_DA_HOME, DESCRICAO_DA_HOME]) {
      expect(texto).not.toMatch(/computador|impressora/i)
      expect(texto).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})

describe('metadataDaPagina', () => {
  // O Next substitui o openGraph do layout inteiro: locale e siteName vêm de novo.
  it('canonical, Open Graph e Twitter, sem declarar imagem (ela vem do opengraph-image.tsx)', () => {
    expect(
      metadataDaPagina({
        caminho: '/',
        titulo: TITULO_DA_HOME,
        descricao: DESCRICAO_DA_HOME,
      }),
    ).toEqual({
      title: { absolute: TITULO_DA_HOME },
      description: DESCRICAO_DA_HOME,
      alternates: { canonical: '/' },
      openGraph: {
        type: 'website',
        locale: 'pt_BR',
        siteName: 'PiluTech',
        url: '/',
        title: TITULO_DA_HOME,
        description: DESCRICAO_DA_HOME,
      },
      twitter: {
        card: 'summary_large_image',
        title: TITULO_DA_HOME,
        description: DESCRICAO_DA_HOME,
      },
    })
  })
})

describe('metadataDoSite', () => {
  // O tipo é `null | string | URL | undefined`: `toEqual(new URL(…))` passaria sempre.
  it('metadataBase no site e a PiluTech como autora', () => {
    const metadata = metadataDoSite(SITE, {})
    expect(metadata.metadataBase?.toString()).toBe(`${SITE}/`)
    expect(metadata).toMatchObject({
      applicationName: 'PiluTech',
      creator: 'PiluTech',
      publisher: 'PiluTech',
      formatDetection: { telephone: false, address: false, email: false },
    })
    expect(metadata).not.toHaveProperty('verification')
  })

  it('GOOGLE_SITE_VERIFICATION vira a meta do Search Console', () => {
    expect(
      metadataDoSite(SITE, { GOOGLE_SITE_VERIFICATION: ' abc123 ' })
        .verification,
    ).toEqual({ google: 'abc123' })
  })

  it('vazia, nenhuma meta de verificação', () => {
    expect(
      metadataDoSite(SITE, { GOOGLE_SITE_VERIFICATION: '' }),
    ).not.toHaveProperty('verification')
  })
})

// A página é escura de cima a baixo: a barra do navegador é a Noite, o --background do .dark.
it('theme-color: a Noite do @piluvitu/ui', () => {
  expect(COR_DO_TEMA).toBe(hslParaHex(tokenDoDs('escuro', 'background')))
  expect(VIEWPORT).toEqual({ themeColor: COR_DO_TEMA })
})
