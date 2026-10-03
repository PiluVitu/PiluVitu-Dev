import { render, screen, within } from '@testing-library/react'
import { DUVIDAS } from '@/lib/conteudo'
import { Duvidas } from './duvidas'

describe('Duvidas', () => {
  it('seção clara, rotulada pelo título, com a âncora #duvidas', () => {
    render(<Duvidas />)
    const secao = screen.getByRole('region', { name: 'Dúvidas comuns' })
    expect(secao).toHaveAttribute('id', 'duvidas')
    expect(secao).not.toHaveClass('dark')
    expect(within(secao).getByText('Perguntas frequentes')).toBeInTheDocument()
    expect(within(secao).getByText('05')).toBeInTheDocument()
  })

  it('as 5 perguntas do design, no acordeão', () => {
    render(<Duvidas />)
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-controls')),
    ).toEqual(DUVIDAS.map((_, i) => `duvida-${i + 1}-resposta`))
  })
})
