import { CONTEXTO_SCHEMA, jsonLdVitrine } from './pilulabs-json-ld'

const SITE = 'https://piluvitu.com.br'

describe('jsonLdVitrine', () => {
  it('é uma CollectionPage da PiluTech', () => {
    expect(jsonLdVitrine(SITE, [], false)).toEqual({
      '@context': CONTEXTO_SCHEMA,
      '@type': 'CollectionPage',
      name: 'PiluLabs',
      description: 'Produtos e apps da PiluTech',
      url: 'https://piluvitu.com.br/pilulabs',
      inLanguage: 'pt-BR',
      publisher: {
        '@type': 'Organization',
        name: 'PiluTech',
        url: 'https://piluvitu.com.br/pilulabs',
      },
    })
  })

  it('lista em hasPart o link de cada item; sem link, sem url', () => {
    expect(
      jsonLdVitrine(
        SITE,
        [
          { nome: 'Botaí', href: '/pilulabs/botai' },
          { nome: 'Sombraí', href: 'https://sombrai.pilutech.com.br' },
          { nome: 'Sem link', href: null },
        ],
        false,
      ),
    ).toMatchObject({
      hasPart: [
        {
          '@type': 'SoftwareApplication',
          name: 'Botaí',
          url: 'https://piluvitu.com.br/pilulabs/botai',
        },
        {
          '@type': 'SoftwareApplication',
          name: 'Sombraí',
          url: 'https://sombrai.pilutech.com.br/',
        },
        { '@type': 'SoftwareApplication', name: 'Sem link' },
      ],
    })
  })

  it('chave ligada: a vitrine e a PiluTech em pilutech.com.br', () => {
    expect(jsonLdVitrine(SITE, [], true)).toMatchObject({
      url: 'https://pilutech.com.br/',
      publisher: { url: 'https://pilutech.com.br/' },
    })
  })
})
