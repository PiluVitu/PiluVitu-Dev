import { renderEstatico } from '@/lib/render-estatico'
import type { Project } from '@/mocks/projects'
import { SecaoPiluLabs } from './secao-pilulabs'

function card(n: number): Project {
  return {
    id: `p${n}`,
    projectName: `Projeto ${n}`,
    subtitle: '',
    projectLogo: '',
    description: `Descrição ${n}`,
    tags: [],
    deployLink: '',
    altImage: 'PR',
  }
}

describe('SecaoPiluLabs', () => {
  it('título PiluLabs com a contagem do total, e um card por item recebido', () => {
    const raiz = renderEstatico(
      <SecaoPiluLabs
        itens={[1, 2, 3, 4].map(card)}
        total={6}
        hrefVitrine="/pilulabs"
      />,
    )
    expect(raiz.querySelector('h2')?.textContent).toBe('PiluLabs')
    expect(raiz.querySelector('#pilulabs-heading + span')?.textContent).toBe(
      '06',
    )
    expect([...raiz.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'Projeto 1',
      'Projeto 2',
      'Projeto 3',
      'Projeto 4',
    ])
  })

  it('"Saiba mais no PiluLabs" leva à vitrine, mesmo sem item', () => {
    const link = [
      ...renderEstatico(
        <SecaoPiluLabs itens={[]} total={0} hrefVitrine="/pilulabs" />,
      ).querySelectorAll('a'),
    ].at(-1)
    expect(link?.textContent).toBe('Saiba mais no PiluLabs')
    expect(link?.getAttribute('href')).toBe('/pilulabs')
  })
})
