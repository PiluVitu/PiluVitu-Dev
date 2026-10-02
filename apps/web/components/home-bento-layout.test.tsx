import { renderEstatico } from '@/lib/render-estatico'
import { HomeBentoLayout } from './home-bento-layout'

describe('HomeBentoLayout', () => {
  it('seções na ordem Carreira, PiluLabs e Artigos; Projetos saiu', () => {
    const raiz = renderEstatico(
      <HomeBentoLayout
        carreiraList={[]}
        piluLabs={{ itens: [], total: 0, hrefVitrine: '/pilulabs' }}
        initialBlogPosts={[]}
      />,
    )
    expect([...raiz.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Carreira',
      'PiluLabs',
      'Artigos',
    ])
  })

  it('repassa os itens e o link da vitrine à seção PiluLabs', () => {
    const raiz = renderEstatico(
      <HomeBentoLayout
        carreiraList={[]}
        piluLabs={{
          itens: [
            {
              id: 'pilulabs-botai',
              projectName: 'Botaí',
              subtitle: '',
              projectLogo: '',
              description: 'd',
              tags: [],
              deployLink: '/pilulabs/botai',
              deployLabel: 'Acessar',
              altImage: 'BO',
            },
          ],
          total: 3,
          hrefVitrine: 'https://pilutech.com.br/',
        }}
        initialBlogPosts={[]}
      />,
    )
    const secao = raiz.querySelector(
      'section[aria-labelledby="pilulabs-heading"]',
    )
    expect(secao?.querySelector('h3')?.textContent).toBe('Botaí')
    expect(
      [...(secao?.querySelectorAll('a') ?? [])].map((a) =>
        a.getAttribute('href'),
      ),
    ).toEqual(['/pilulabs/botai', 'https://pilutech.com.br/'])
  })
})
