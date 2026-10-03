import { render, screen } from '@testing-library/react'
import { WHATSAPP } from '@/lib/contato'
import { WhatsappFlutuante } from './whatsapp-flutuante'

describe('WhatsappFlutuante', () => {
  it('tem nome, leva à conversa geral e abre em aba nova', () => {
    render(<WhatsappFlutuante />)
    const link = screen.getByRole('link', { name: 'Falar no WhatsApp' })
    expect(link).toHaveAttribute('aria-label', 'Falar no WhatsApp')
    expect(link).toHaveAttribute('href', WHATSAPP.geral)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('fica fixo no canto de baixo, acima do resto', () => {
    render(<WhatsappFlutuante />)
    expect(screen.getByRole('link')).toHaveClass(
      'fixed',
      'right-5',
      'bottom-5',
      'z-30',
    )
  })

  it('o ícone é decorativo', () => {
    const { container } = render(<WhatsappFlutuante />)
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
