import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderEstatico } from '@/lib/render-estatico'
import { HomeFooter } from './home-footer'

function rodape(mostrarPiluLabs?: boolean) {
  return renderEstatico(
    <QueryClientProvider client={new QueryClient()}>
      <HomeFooter
        name="Paulo Victor Torres Silva"
        year={2026}
        mostrarPiluLabs={mostrarPiluLabs}
      />
    </QueryClientProvider>,
  )
}

describe('HomeFooter', () => {
  it('por padrão não mostra /pilulabs', () => {
    expect(rodape().querySelector('a[href="/pilulabs"]')).toBeNull()
  })

  it('sem produto listado, sem /pilulabs', () => {
    expect(rodape(false).querySelector('a[href="/pilulabs"]')).toBeNull()
  })

  it('com produto listado, mostra /pilulabs depois de /tools e /tasks', () => {
    const hrefs = [...rodape(true).querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs.slice(0, 3)).toEqual(['/tools', '/tasks', '/pilulabs'])
  })
})
