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
    expect(within(secao).getByText('07')).toBeInTheDocument()
  })

  it('as 7 perguntas no acordeão, as duas de IA logo depois da do orçamento de infraestrutura', () => {
    render(<Duvidas />)
    const perguntas = screen.getAllByRole('button')
    expect(perguntas.map((b) => b.getAttribute('aria-controls'))).toEqual(
      DUVIDAS.map((_, i) => `duvida-${i + 1}-resposta`),
    )
    expect(perguntas.map((b) => b.firstChild?.textContent)).toEqual([
      'Quanto custa um aplicativo?',
      'Você assume um aplicativo que outra pessoa fez?',
      'Como funciona o orçamento de infraestrutura?',
      'Meus dados ficam seguros com IA?',
      'Quanto custa usar IA no dia a dia?',
      'O atendimento é só em Teresina?',
      'A PiluTech ainda faz manutenção de computadores e impressoras?',
    ])
    expect(perguntas.map((b) => b.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
      'false',
    ])
  })
})
