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
    expect(within(secao).getByText('Planos de manutenção')).toBeInTheDocument()
    expect(within(secao).getByText('04')).toBeInTheDocument()
  })

  it('os 4 planos, IA logo depois de infraestrutura, com o público e os itens', () => {
    render(<Planos />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Infraestrutura', 'IA', 'Essencial', 'Evolução'])
    // O IA e o Evolução repetem o "Relatório mensal do que foi feito": cada cartão é conferido por dentro.
    for (const plano of PLANOS) {
      const cartao = screen
        .getByRole('heading', { level: 3, name: plano.nome })
        .closest('li') as HTMLElement
      expect(within(cartao).getByText(plano.para)).toBeInTheDocument()
      for (const item of plano.itens)
        expect(within(cartao).getByText(item)).toBeInTheDocument()
    }
  })

  it('o plano de IA: público, itens com ✓ e o WhatsApp com a mensagem dele', () => {
    render(<Planos />)
    const cartao = screen
      .getByRole('heading', { level: 3, name: 'IA' })
      .closest('li') as HTMLElement
    expect(
      within(cartao).getByText('Para quem já usa IA no dia a dia.'),
    ).toBeInTheDocument()
    expect(
      within(cartao)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      '✓Acompanhamento do custo e do uso dos modelos',
      '✓Ajuste das respostas e das instruções',
      '✓Atualização dos modelos e da base de documentos',
      '✓Relatório mensal do que foi feito',
    ])
    const link = within(cartao).getByRole('link', {
      name: 'Pedir proposta do plano IA',
    })
    const url = new URL(link.getAttribute('href') as string)
    expect(`${url.origin}${url.pathname}`).toBe('https://wa.me/5586981737625')
    expect(url.searchParams.get('text')).toBe(
      'Olá! Quero uma proposta do plano de IA.',
    )
  })

  // O texto visível é "Pedir proposta" em todos; o nome acessível diz de qual plano é.
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
