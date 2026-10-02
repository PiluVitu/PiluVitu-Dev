import { renderEstatico } from '@/lib/render-estatico'
import { ProjectCard } from './project-card'

const BASE = {
  id: 'live-prs',
  projectName: 'Live PRs',
  subtitle: '',
  projectLogo: '/pr-live-dark.svg',
  description: 'Agregador de pull requests.',
  tags: [],
  deployLink: 'https://pr-live.example.com',
  altImage: 'LPR',
}

describe('ProjectCard', () => {
  it('link externo abre em aba nova, com o rótulo Demo', () => {
    const link = renderEstatico(<ProjectCard {...BASE} />).querySelector(
      'a[href="https://pr-live.example.com"]',
    )
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.textContent).toBe('Demo')
  })

  // O card de um produto PiluLabs leva a uma página do próprio site.
  it('link interno fica na mesma aba e usa o deployLabel', () => {
    const link = renderEstatico(
      <ProjectCard
        {...BASE}
        deployLink="/pilulabs/botai"
        deployLabel="Acessar"
      />,
    ).querySelector('a[href="/pilulabs/botai"]')
    expect(link?.hasAttribute('target')).toBe(false)
    expect(link?.textContent).toBe('Acessar')
  })

  // O Button do @piluvitu/ui não tem gap: sem gap-2, o ícone gruda no texto.
  it('o Acessar separa o ícone do texto', () => {
    const link = renderEstatico(
      <ProjectCard {...BASE} deployLabel="Acessar" />,
    ).querySelector('a')
    expect(link?.className.split(' ')).toContain('gap-2')
  })

  it('o Acessar tem o mesmo ícone com link interno e externo', () => {
    const icone = (deployLink: string) =>
      renderEstatico(<ProjectCard {...BASE} deployLink={deployLink} />)
        .querySelector('a svg')
        ?.getAttribute('data-icon')
    expect(icone('/pilulabs/botai')).toBe('arrow-right')
    expect(icone('https://sombrai.pilutech.com.br')).toBe('arrow-right')
  })

  it('o card tem só o Acessar, sem o botão Código', () => {
    const raiz = renderEstatico(<ProjectCard {...BASE} />)
    expect(raiz.querySelectorAll('a')).toHaveLength(1)
    expect(raiz.textContent).not.toContain('Código')
  })
})
