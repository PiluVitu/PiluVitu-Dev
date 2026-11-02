import { renderEstatico } from '@/lib/render-estatico'
import { HomeBentoLayout } from './home-bento-layout'

describe('HomeBentoLayout', () => {
  const raiz = () =>
    renderEstatico(<HomeBentoLayout carreiraList={[]} initialBlogPosts={[]} />)

  it('seções PiluTech, Carreira, Stack e Artigos; o Laboratório saiu', () => {
    expect(
      [...raiz().querySelectorAll('h2')].map((h) => h.textContent),
    ).toEqual([
      'Meus apps agora moram na PiluTech',
      'Carreira',
      'STACK',
      'Artigos',
    ])
    expect(
      raiz().querySelector('[aria-labelledby="pilulabs-heading"]'),
    ).toBeNull()
    expect(raiz().textContent).not.toMatch(/Laborat[oó]rio|Live PRs/)
  })

  it('os 6 apps linkam a página deles na PiluTech', () => {
    const hrefs = [...raiz().querySelectorAll('#servicos a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toEqual([
      'https://pilutech.com.br/apps',
      ...['orai', 'listai', 'sombrai', 'apurai', 'botai', 'toolkit'].map(
        (s) => `https://pilutech.com.br/apps/${s}`,
      ),
    ])
  })

  it('o stack.yaml lista os três grupos', () => {
    const texto = raiz().textContent ?? ''
    expect(texto).toContain('cat stack.yaml')
    for (const item of [
      'AWS',
      'Cloudflare',
      'Grafana',
      'Sentry',
      'Go',
      'React',
    ])
      expect(texto).toContain(item)
  })
})
