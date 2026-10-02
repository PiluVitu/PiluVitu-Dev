import { render, screen } from '@testing-library/react'
import { WHATSAPP } from '@/lib/contato'
import { Hero } from './hero'

describe('Hero', () => {
  it('é o banner escuro, com a âncora #inicio', () => {
    render(<Hero />)
    const banner = screen.getByRole('banner')
    expect(banner).toHaveAttribute('id', 'inicio')
    expect(banner).toHaveClass('dark')
  })

  it('o h1 e os textos do design', () => {
    render(<Hero />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Aplicativos, infraestrutura e desenvolvimento fullstack.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('~/pilutech · Teresina, PI · atendimento remoto'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'A PiluTech cria e mantém aplicativos, provisiona infraestrutura em nuvem e entrega o orçamento de cada item antes de você contratar. Você fala direto com quem desenvolve.',
      ),
    ).toBeInTheDocument()
  })

  it('Falar no WhatsApp abre a conversa geral em aba nova', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: 'Falar no WhatsApp' })
    expect(link).toHaveAttribute('href', WHATSAPP.geral)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('Ver serviços leva à seção, na mesma aba', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: 'Ver serviços' })
    expect(link).toHaveAttribute('href', '#servicos')
    expect(link).not.toHaveAttribute('target')
  })

  it('traz o terminal', () => {
    render(<Hero />)
    expect(
      screen.getByText(/agenda aberta para novos projetos$/),
    ).toBeInTheDocument()
  })

  // Review Focus 1: "infraestrutura" a 40 px num celular de 320 px.
  it('o h1 quebra palavra longa em vez de vazar', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(
      'wrap-break-word',
    )
  })

  // Review Focus 7: o anel do Button (1 px na cor do ring) é o Ciano do próprio botão no escuro.
  it('os dois botões têm anel de foco de 2 px com folga do fundo', () => {
    render(<Hero />)
    for (const nome of ['Falar no WhatsApp', 'Ver serviços'])
      expect(screen.getByRole('link', { name: nome })).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
      )
  })
})
