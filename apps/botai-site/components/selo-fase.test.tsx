import { render, screen } from '@testing-library/react'
import { SeloFase } from './selo-fase'

describe('SeloFase', () => {
  it('em-breve mostra "Em breve"', () => {
    const { container } = render(<SeloFase fase="em-breve" />)
    expect(container.textContent).toBe('Em breve')
  })

  it('disponivel mostra "Disponível", com o fundo da marca', () => {
    render(<SeloFase fase="disponivel" />)
    expect(screen.getByText('Disponível')).toHaveClass('bg-primary')
  })
})
