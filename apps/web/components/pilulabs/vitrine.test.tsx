import { renderEstatico } from '@/lib/render-estatico'
import { Vitrine, type ItemVitrine } from './vitrine'

function item(
  slug: string,
  tipo: ItemVitrine['produto']['tipo'],
  nome: string,
): ItemVitrine {
  return {
    produto: {
      slug,
      tipo,
      nome,
      resumo: `Resumo de ${nome}`,
      icone: '',
      tags: [],
    },
    fase: 'em-breve',
    lojas: [],
  }
}

describe('Vitrine', () => {
  it('sem produto listado, mostra o estado vazio com link para o autor', () => {
    const raiz = renderEstatico(<Vitrine itens={[]} />)
    const vazio = raiz.querySelector('[data-testid="pilulabs-vazio"]')
    expect(vazio?.textContent).toContain(
      'PiluLabs: produtos da PiluTech. Em breve.',
    )
    expect(vazio?.querySelector('a')?.getAttribute('href')).toBe('/')
    expect(raiz.querySelector('h2')).toBeNull()
  })

  it('agrupa por tipo, na ordem extensões, apps web e CLIs, e pula grupo vazio', () => {
    const raiz = renderEstatico(
      <Vitrine
        itens={[item('zap', 'cli', 'Zap'), item('botai', 'extensao', 'Botaí')]}
      />,
    )
    expect([...raiz.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Extensões',
      'CLIs',
    ])
  })

  it('um card por produto, levando à página dele, sem o estado vazio', () => {
    const raiz = renderEstatico(
      <Vitrine
        itens={[
          item('botai', 'extensao', 'Botaí'),
          item('outro', 'extensao', 'Outro'),
        ]}
      />,
    )
    expect(
      [...raiz.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    ).toEqual(['/pilulabs/botai', '/pilulabs/outro'])
    expect(raiz.querySelector('[data-testid="pilulabs-vazio"]')).toBeNull()
  })
})
