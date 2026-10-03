import { render, screen, within } from '@testing-library/react'
import { PLANOS } from '@/lib/conteudo'
import { Planos } from './planos'

describe('Planos', () => {
  it('seção Petróleo (o primary do tema claro), com a âncora #planos e o texto de apoio', () => {
    render(<Planos />)
    const secao = screen.getByRole('region', {
      name: 'Seu aplicativo atualizado, monitorado e no ar.',
    })
    expect(secao).toHaveAttribute('id', 'planos')
    expect(secao).toHaveClass('bg-primary', 'text-primary-foreground')
    expect(secao).not.toHaveClass('dark')
    expect(
      within(secao).getByText(
        'Planos mensais. O valor depende do tamanho do aplicativo e da infraestrutura, e vem na proposta.',
      ),
    ).toBeInTheDocument()
  })

  it('os 3 planos, com o público e os itens', () => {
    render(<Planos />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(PLANOS.map((p) => p.nome))
    for (const plano of PLANOS) {
      expect(screen.getByText(plano.para)).toBeInTheDocument()
      for (const item of plano.itens)
        expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  // O texto visível é "Pedir proposta" nos três; o nome acessível diz de qual plano é.
  it('cada "Pedir proposta" abre o WhatsApp com a mensagem do plano, em aba nova', () => {
    render(<Planos />)
    for (const plano of PLANOS) {
      const link = screen.getByRole('link', {
        name: `Pedir proposta do plano ${plano.nome}`,
      })
      expect(link).toHaveAttribute('href', plano.whatsapp)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(within(link).getByText(`do plano ${plano.nome}`)).toHaveClass(
        'sr-only',
      )
    }
  })

  // Review Focus 7: o anel padrão seria Petróleo sobre o cartão Petróleo (cerca de 1,4:1).
  it('o foco de cada "Pedir proposta" é um anel branco com folga Petróleo', () => {
    render(<Planos />)
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-white',
        'focus-visible:ring-offset-petroleo-cartao',
      )
      expect(link).not.toHaveClass('focus-visible:ring-ring')
    }
  })
})
