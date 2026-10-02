import { render, screen, within } from '@testing-library/react'
import { BOTAI, SOMBRAI } from '@/lib/conteudo'
import { Projetos } from './projetos'

function cartao(href: string): HTMLElement {
  const link = document.querySelector(`a[href="${href}"]`)
  if (!(link instanceof HTMLElement)) throw new Error(`sem cartão para ${href}`)
  return link
}

describe('Projetos', () => {
  it('seção clara, rotulada pelo título, com a âncora #projetos', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    const secao = screen.getByRole('region', {
      name: 'Produtos próprios da PiluTech.',
    })
    expect(secao).toHaveAttribute('id', 'projetos')
    expect(secao).not.toHaveClass('dark')
  })

  it('os dois produtos, cada um levando ao domínio dele em aba nova', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Botaí', 'Sombraí'])
    for (const projeto of [BOTAI, SOMBRAI]) {
      const link = cartao(projeto.url)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(within(link).getByText(projeto.texto)).toBeInTheDocument()
      expect(link).toHaveTextContent(projeto.endereco)
    }
  })

  it('a imagem OG de cada domínio passa pelo otimizador do Next, com o alt do design', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    for (const projeto of [BOTAI, SOMBRAI]) {
      const imagem = screen.getByRole('img', { name: projeto.imagem.alt })
      expect(imagem.getAttribute('src')).toContain(
        `url=${encodeURIComponent(projeto.imagem.src)}&`,
      )
    }
  })

  it('sem loja publicada, os dois selos dizem em breve', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    expect(
      within(cartao(BOTAI.url)).getByText('Extensão de navegador · em breve'),
    ).toBeInTheDocument()
    expect(
      within(cartao(SOMBRAI.url)).getByText('App Android e iPhone · em breve'),
    ).toBeInTheDocument()
  })

  it('com o Botaí publicado no CMS, só o selo dele diz disponível', () => {
    render(<Projetos faseDoBotai="disponivel" />)
    expect(
      within(cartao(BOTAI.url)).getByText('Extensão de navegador · disponível'),
    ).toBeInTheDocument()
    expect(
      within(cartao(SOMBRAI.url)).getByText('App Android e iPhone · em breve'),
    ).toBeInTheDocument()
  })
})
