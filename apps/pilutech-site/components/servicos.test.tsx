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
    expect(within(secao).getByText('04')).toBeInTheDocument()
  })

  it('os 4 cartões, IA logo depois de infraestrutura: número e área, título, texto e itens', () => {
    render(<Servicos />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'Provisionamento e orçamento',
      'IA sob medida',
      'Criação e manutenção',
      'Desenvolvimento sob medida',
    ])
    expect(
      screen.getAllByText(/^\d{2} · /).map((rotulo) => rotulo.textContent),
    ).toEqual([
      '01 · Infraestrutura',
      '02 · Inteligência artificial',
      '03 · Aplicativos',
      '04 · Fullstack',
    ])
    for (const servico of SERVICOS) {
      expect(screen.getByText(servico.texto)).toBeInTheDocument()
      for (const item of servico.itens)
        expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  it('um ícone decorativo por cartão, o cérebro no de IA', () => {
    const { container } = render(<Servicos />)
    const icones = [...container.querySelectorAll('svg')]
    expect(icones.map((icone) => icone.getAttribute('data-icon'))).toEqual([
      'server',
      'brain',
      'mobile-screen',
      'layer-group',
    ])
    for (const icone of icones)
      expect(icone).toHaveAttribute('aria-hidden', 'true')
  })
})
