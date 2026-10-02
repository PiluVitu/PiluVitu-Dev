import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderEstatico } from '@/lib/render-estatico'
import { HomeFooter } from './home-footer'

function rodape(piluLabsHref?: string) {
  return renderEstatico(
    <QueryClientProvider client={new QueryClient()}>
      <HomeFooter
        name="Paulo Victor Torres Silva"
        year={2026}
        piluLabsHref={piluLabsHref}
      />
    </QueryClientProvider>,
  )
}

const hrefs = (raiz: HTMLElement) =>
  [...raiz.querySelectorAll('a')].map((a) => a.getAttribute('href'))

describe('HomeFooter', () => {
  it('sem item listado (sem href), sem /pilulabs', () => {
    expect(hrefs(rodape())).not.toContain('/pilulabs')
    expect(rodape().textContent).not.toContain('/pilulabs')
  })

  it('com item listado, mostra /pilulabs depois de /tools e /tasks', () => {
    expect(hrefs(rodape('/pilulabs')).slice(0, 3)).toEqual([
      '/tools',
      '/tasks',
      '/pilulabs',
    ])
  })

  it('com os subdomínios ligados, /pilulabs leva a pilutech.com.br', () => {
    const link = [
      ...rodape('https://pilutech.com.br/').querySelectorAll('a'),
    ][2]
    expect(link?.textContent).toBe('/pilulabs')
    expect(link?.getAttribute('href')).toBe('https://pilutech.com.br/')
  })
})
