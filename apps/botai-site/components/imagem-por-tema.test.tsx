import { render } from '@testing-library/react'
import { CAPTURAS } from '@/lib/capturas'
import { ImagemPorTema } from './imagem-por-tema'

const [PRIMEIRA] = CAPTURAS

function imagens(destaque?: boolean) {
  const { container } = render(
    <ImagemPorTema
      variantes={PRIMEIRA.variantes}
      sizes="100vw"
      destaque={destaque}
    />,
  )
  return [...container.querySelectorAll('img')]
}

describe('ImagemPorTema', () => {
  // Segue a classe .dark do <html> (a escolha de quem visita), não o prefers-color-scheme.
  it('as duas variantes vêm no HTML, e a classe dark decide qual aparece', () => {
    const [claro, escuro] = imagens()
    expect(claro).toHaveAttribute('alt', PRIMEIRA.variantes.claro.alt)
    expect(claro).toHaveClass('dark:hidden')
    expect(escuro).toHaveAttribute('alt', PRIMEIRA.variantes.escuro.alt)
    expect(escuro).toHaveClass('hidden', 'dark:block')
  })

  // Imagem lazy com display:none não é baixada: só a variante do tema ativo sai pela rede.
  it('nenhuma variante é eager, nem a do topo', () => {
    for (const img of [...imagens(), ...imagens(true)])
      expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('na captura do topo (o LCP), as duas pedem prioridade alta', () => {
    for (const img of imagens(true))
      expect(img).toHaveAttribute('fetchpriority', 'high')
  })

  it('fora do topo, sem prioridade', () => {
    for (const img of imagens())
      expect(img).not.toHaveAttribute('fetchpriority')
  })
})
