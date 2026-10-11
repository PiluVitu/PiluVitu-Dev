import { render, screen } from '@testing-library/react'
import { Rodape } from './rodape'

describe('Rodape', () => {
  it('é o contentinfo escuro, com o símbolo e o nome', () => {
    render(<Rodape ano={2026} />)
    expect(screen.getByRole('contentinfo')).toHaveClass('dark')
    expect(screen.getByText('PiluTech')).toBeInTheDocument()
  })

  it('o texto do design, com o ano recebido', () => {
    const { rerender } = render(<Rodape ano={2026} />)
    expect(
      screen.getByText(
        '© 2026 PiluTech · Paulo Victor T S · pilutechinformatica@gmail.com',
      ),
    ).toBeInTheDocument()
    rerender(<Rodape ano={2027} />)
    expect(screen.getByText(/^© 2027 PiluTech/)).toBeInTheDocument()
  })

  it('leva à política de privacidade, na mesma aba', () => {
    render(<Rodape ano={2026} />)
    const link = screen.getByRole('link', { name: 'Política de privacidade' })
    expect(link).toHaveAttribute('href', '/privacidade')
    expect(link).not.toHaveAttribute('target')
  })
})
