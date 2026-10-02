import { renderEstatico } from '@/lib/render-estatico'
import type { TipoItem } from '@piluvitu/tools/pilulabs'
import { Vitrine, type ItemVitrine } from './vitrine'

function itemVitrine(
  slug: string,
  tipo: TipoItem,
  nome: string,
  href: string | null = `/pilulabs/${slug}`,
): ItemVitrine {
  return {
    item: {
      slug,
      tipo,
      nome,
      subtitulo: '',
      descricao: `Descrição de ${nome}`,
      logo: '',
      sigla: nome.slice(0, 2).toUpperCase(),
      tags: [],
    },
    href,
    fase: 'em-breve',
    lojas: [],
  }
}

describe('Vitrine', () => {
  it('sem item listado, mostra o estado vazio com link para o autor', () => {
    const raiz = renderEstatico(
      <Vitrine itens={[]} hrefAutor="https://piluvitu.com.br/" />,
    )
    const vazio = raiz.querySelector('[data-testid="pilulabs-vazio"]')
    expect(vazio?.textContent).toContain(
      'PiluLabs: produtos da PiluTech. Em breve.',
    )
    expect(vazio?.querySelector('a')?.getAttribute('href')).toBe(
      'https://piluvitu.com.br/',
    )
    expect(raiz.querySelector('h2')).toBeNull()
  })

  it('agrupa nos 4 tipos, na ordem extensões, apps mobile, apps web e CLIs, e pula grupo vazio', () => {
    const raiz = renderEstatico(
      <Vitrine
        hrefAutor="/"
        itens={[
          itemVitrine('zap', 'cli', 'Zap'),
          itemVitrine('sombrai', 'mobile', 'Sombraí'),
          itemVitrine('botai', 'extensao', 'Botaí'),
        ]}
      />,
    )
    expect([...raiz.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Extensões',
      'Apps mobile',
      'CLIs',
    ])
  })

  it('um card por item, com o link de cada um; sem link, sem <a>', () => {
    const raiz = renderEstatico(
      <Vitrine
        hrefAutor="/"
        itens={[
          itemVitrine('botai', 'extensao', 'Botaí'),
          itemVitrine(
            'sombrai',
            'mobile',
            'Sombraí',
            'https://sombrai.pilutech.com.br',
          ),
          itemVitrine('sem-link', 'web', 'Sem link', null),
        ]}
      />,
    )
    expect(
      [...raiz.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    ).toEqual(['/pilulabs/botai', 'https://sombrai.pilutech.com.br'])
    expect(raiz.querySelectorAll('h3')).toHaveLength(3)
    expect(raiz.querySelector('[data-testid="pilulabs-vazio"]')).toBeNull()
  })
})
