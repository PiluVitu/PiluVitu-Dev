import { render, screen, within } from '@testing-library/react'
import { Landing } from './landing'

describe('Landing', () => {
  it('um único h1, no banner, fora do main', () => {
    render(<Landing faseDoBotai="em-breve" />)
    const [h1, ...outros] = screen.getAllByRole('heading', { level: 1 })
    expect(outros).toEqual([])
    expect(screen.getByRole('banner')).toContainElement(h1)
    expect(screen.getByRole('main')).not.toContainElement(
      screen.getByRole('banner'),
    )
  })

  it('as seções do corpo, na ordem do design', () => {
    render(<Landing faseDoBotai="em-breve" />)
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
    ])
  })

  it('o selo do Botaí segue a fase recebida', () => {
    render(<Landing faseDoBotai="disponivel" />)
    expect(
      screen.getByText('Extensão de navegador · disponível'),
    ).toBeInTheDocument()
  })
})
