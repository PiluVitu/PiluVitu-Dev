import { render, screen, within } from '@testing-library/react'
import { TECNOLOGIAS } from '@/lib/conteudo'
import { Tecnologias } from './tecnologias'

describe('Tecnologias', () => {
  it('seção escura, rotulada pelo título, com a âncora #tecnologias', () => {
    render(<Tecnologias />)
    const secao = screen.getByRole('region', {
      name: 'Ferramentas usadas no dia a dia.',
    })
    expect(secao).toHaveAttribute('id', 'tecnologias')
    expect(secao).toHaveClass('dark')
  })

  it('os 3 grupos, cada um com a lista de ferramentas do design', () => {
    render(<Tecnologias />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(TECNOLOGIAS.map((g) => g.grupo))
    for (const grupo of TECNOLOGIAS)
      expect(
        within(screen.getByRole('list', { name: grupo.grupo }))
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([...grupo.itens])
  })
})
