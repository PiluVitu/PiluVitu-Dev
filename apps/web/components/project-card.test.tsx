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
  repoLink: '',
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
        deployLabel="Ver no PiluLabs"
      />,
    ).querySelector('a[href="/pilulabs/botai"]')
    expect(link?.hasAttribute('target')).toBe(false)
    expect(link?.textContent).toBe('Ver no PiluLabs')
  })
})
