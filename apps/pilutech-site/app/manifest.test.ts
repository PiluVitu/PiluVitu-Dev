import manifest from './manifest'

it('nome, idioma, a Noite e o ícone de 192 px', () => {
  expect(manifest()).toEqual({
    name: 'PiluTech',
    short_name: 'PiluTech',
    description:
      'Infraestrutura, implementação de IA sob medida e desenvolvimento de aplicativos e sistemas. A PiluTech fica em Teresina (PI) e atende remoto em todo o Brasil.',
    lang: 'pt-BR',
    start_url: '/',
    display: 'browser',
    background_color: '#090b11',
    theme_color: '#090b11',
    icons: [{ src: '/icon', sizes: '192x192', type: 'image/png' }],
  })
})
