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
    expect(within(secao).getByText('Tecnologias')).toBeInTheDocument()
    expect(within(secao).getByText('04')).toBeInTheDocument()
  })

  it('os 4 grupos, IA logo depois de infraestrutura, cada um com a sua lista de ferramentas', () => {
    render(<Tecnologias />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Infraestrutura', 'IA', 'Back-end', 'Front-end'])
    expect(
      within(screen.getByRole('list', { name: 'IA' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'OpenAI',
      'Claude',
      'Ollama',
      'Whisper',
      'MLX',
      'RAG',
      'Fine-tuning',
    ])
    for (const grupo of TECNOLOGIAS)
      expect(
        within(screen.getByRole('list', { name: grupo.grupo }))
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([...grupo.itens])
  })
})
