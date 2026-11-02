import { renderEstatico } from '@/lib/render-estatico'
import type { SiteProfileContent } from '@/lib/site-content'
import { Bio } from './bio'

jest.mock('./mode-toggle', () => ({ ModeToggle: () => null }))

const perfil: SiteProfileContent = {
  displayName: 'Paulo Victor Torres Silva',
  avatarSrc: '/profile-2.jpg',
  avatarAlt: 'Paulo',
  roleHighlight: 'Site Reliability Engineering',
  companyName: 'Reapho',
  companyLink: 'https://reapho.app/en',
  companyLinkColor: '#14b8a6',
  bio: 'Bio.',
  availabilityOpen: true,
  availabilityLabel: 'Disponível para oportunidades',
  location: 'Brasil · Remoto',
  disciplines: ['SRE', 'DevOps', 'Cloud'],
}

describe('Bio', () => {
  const raiz = () => renderEstatico(<Bio profile={perfil} socials={[]} />)

  it('o selo de disponibilidade saiu, mesmo com availabilityOpen', () => {
    expect(raiz().textContent).not.toContain('Disponível para oportunidades')
  })

  it('mostra o kubectl com os cinco pods e a linha de local e áreas', () => {
    const r = raiz()
    const kubectl = r.querySelector('[data-testid="home-kubectl"]')
    expect(kubectl?.textContent).toContain('kubectl get pods -n pilutech')
    for (const pod of ['orai', 'listai', 'sombrai', 'apurai', 'botai'])
      expect(kubectl?.textContent).toContain(pod)
    expect(r.textContent).toContain('Brasil · Remoto · SRE · DevOps · Cloud')
  })

  it('cada pod do kubectl tem um atraso diferente (escalonado)', () => {
    const linhas = [
      ...raiz().querySelectorAll('[data-testid="home-kubectl"] > div'),
    ].slice(2)
    const atrasos = linhas.map(
      (l) => l.className.match(/\[--atraso-pod:([^\]]+)\]/)?.[1] ?? '0s',
    )
    expect(atrasos).toEqual(['0s', '.8s', '1.6s', '2.4s', '3.2s'])
  })

  it('cargo com o link da empresa', () => {
    const link = raiz().querySelector('a[href="https://reapho.app/en"]')
    expect(link?.textContent).toBe('Reapho')
  })
})
