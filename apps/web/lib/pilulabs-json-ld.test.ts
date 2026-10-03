import { CONTEXTO_SCHEMA, jsonLdVitrine } from './pilulabs-json-ld'

const SITE = 'https://piluvitu.com.br'

describe('jsonLdVitrine', () => {
  // A vitrine mora no piluvitu.com.br; quem publica é a PiluTech, no site dela, com o
  // mesmo @id da Organization do apps/pilutech-site e do apps/botai-site.
  it('é uma CollectionPage em /pilulabs, publicada pela PiluTech', () => {
    expect(jsonLdVitrine(SITE, [])).toEqual({
      '@context': CONTEXTO_SCHEMA,
      '@type': 'CollectionPage',
      name: 'PiluLabs',
      description: 'Produtos e apps da PiluTech',
      url: 'https://piluvitu.com.br/pilulabs',
      inLanguage: 'pt-BR',
      publisher: {
        '@type': 'Organization',
        '@id': 'https://pilutech.com.br/#organizacao',
        name: 'PiluTech',
        url: 'https://pilutech.com.br',
      },
    })
  })

  it('lista em hasPart o link de cada item; sem link, sem url', () => {
    expect(
      jsonLdVitrine(SITE, [
        { nome: 'Botaí', href: 'https://botai.pilutech.com.br' },
        { nome: 'Página própria', href: '/pilulabs/exemplo' },
        { nome: 'Sem link', href: null },
      ]),
    ).toMatchObject({
      hasPart: [
        {
          '@type': 'SoftwareApplication',
          name: 'Botaí',
          url: 'https://botai.pilutech.com.br/',
        },
        {
          '@type': 'SoftwareApplication',
          name: 'Página própria',
          url: 'https://piluvitu.com.br/pilulabs/exemplo',
        },
        { '@type': 'SoftwareApplication', name: 'Sem link' },
      ],
    })
  })
})
