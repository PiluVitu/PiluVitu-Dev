import { render, screen, within } from '@testing-library/react'
import { SERVICOS } from '@/lib/conteudo'
import { Servicos } from './servicos'

describe('Servicos', () => {
  it('seção clara, rotulada pelo título, com a âncora #servicos', () => {
    render(<Servicos />)
    const secao = screen.getByRole('region', {
      name: 'Do primeiro protótipo ao servidor em produção.',
    })
    expect(secao).toHaveAttribute('id', 'servicos')
    expect(secao).not.toHaveClass('dark')
    expect(within(secao).getByText('Serviços')).toBeInTheDocument()
    expect(within(secao).getByText('03')).toBeInTheDocument()
  })

  it('os 3 cartões: número e área, título, texto e itens', () => {
    render(<Servicos />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(SERVICOS.map((s) => s.titulo))
    for (const rotulo of [
      '01 · Aplicativos',
      '02 · Infraestrutura',
      '03 · Fullstack',
    ])
      expect(screen.getByText(rotulo)).toBeInTheDocument()
    for (const servico of SERVICOS) {
      expect(screen.getByText(servico.texto)).toBeInTheDocument()
      for (const item of servico.itens)
        expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  it('os ícones são decorativos', () => {
    const { container } = render(<Servicos />)
    const icones = container.querySelectorAll('svg')
    expect(icones).toHaveLength(3)
    for (const icone of icones)
      expect(icone).toHaveAttribute('aria-hidden', 'true')
  })
})
