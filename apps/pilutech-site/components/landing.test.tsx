import { render, screen, within } from '@testing-library/react'
import { Landing } from './landing'

const segue = (antes: Element, depois: Element) =>
  Boolean(
    antes.compareDocumentPosition(depois) & Node.DOCUMENT_POSITION_FOLLOWING,
  )

describe('Landing', () => {
  it('um único h1, no banner, fora do main', () => {
    render(<Landing faseDoBotai="em-breve" ano={2026} />)
    const [h1, ...outros] = screen.getAllByRole('heading', { level: 1 })
    expect(outros).toEqual([])
    expect(screen.getByRole('banner')).toContainElement(h1)
    expect(screen.getByRole('main')).not.toContainElement(
      screen.getByRole('banner'),
    )
  })

  it('a ordem do design: barra, hero, main, rodapé e o botão flutuante', () => {
    render(<Landing faseDoBotai="em-breve" ano={2026} />)
    const barra = screen.getByRole('navigation', { name: 'Principal' })
    const hero = screen.getByRole('banner')
    const main = screen.getByRole('main')
    const rodape = screen.getByRole('contentinfo')
    // O primeiro "Falar no WhatsApp" é o botão do hero; o segundo, o flutuante.
    const [, flutuante] = screen.getAllByRole('link', {
      name: 'Falar no WhatsApp',
    })
    expect(segue(barra, hero) && segue(hero, main) && segue(main, rodape)).toBe(
      true,
    )
    expect(segue(rodape, flutuante)).toBe(true)
  })

  it('as seções do main, na ordem do design', () => {
    render(<Landing faseDoBotai="em-breve" ano={2026} />)
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual([
      'Do primeiro protótipo ao servidor em produção.',
      'Quatro etapas, com escopo e valor por escrito.',
      'Produtos próprios da PiluTech.',
      'Ferramentas usadas no dia a dia.',
      'Seu aplicativo atualizado, monitorado e no ar.',
      'Dúvidas comuns',
      'Conte o que você precisa.',
    ])
  })

  it('o selo do Botaí segue a fase, e o rodapé o ano', () => {
    render(<Landing faseDoBotai="disponivel" ano={2027} />)
    expect(
      screen.getByText('Extensão de navegador · disponível'),
    ).toBeInTheDocument()
    expect(screen.getByText(/^© 2027 PiluTech/)).toBeInTheDocument()
  })
})
