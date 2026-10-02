import { render, screen } from '@testing-library/react'
import { CabecalhoSecao } from './cabecalho-secao'

describe('CabecalhoSecao', () => {
  // A seção aponta para ele com aria-labelledby.
  it('o título é o h2 com o id recebido', () => {
    render(
      <CabecalhoSecao
        id="servicos-titulo"
        rotulo="Serviços"
        contagem={3}
        titulo="Do primeiro protótipo ao servidor em produção."
      />,
    )
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Do primeiro protótipo ao servidor em produção.',
      }),
    ).toHaveAttribute('id', 'servicos-titulo')
  })

  it('o rótulo e a contagem com dois dígitos ficam fora do título', () => {
    render(
      <CabecalhoSecao
        id="duvidas-titulo"
        rotulo="Perguntas frequentes"
        contagem={5}
        titulo="Dúvidas comuns"
      />,
    )
    expect(screen.getByText('Perguntas frequentes')).toBeInTheDocument()
    expect(screen.getByText('05')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /^Dúvidas comuns$/,
    )
  })

  it('no tom padrão, o rótulo usa o destaque do contexto e a linha a borda', () => {
    const { container } = render(
      <CabecalhoSecao id="a" rotulo="Projetos" contagem={2} titulo="T" />,
    )
    expect(screen.getByText('Projetos')).toHaveClass('text-primary')
    expect(container.querySelector('.h-px')).toHaveClass('bg-border')
  })

  it('no Petróleo, rótulo e contagem em branco e a linha clara do design', () => {
    const { container } = render(
      <CabecalhoSecao
        id="planos-titulo"
        rotulo="Planos de manutenção"
        contagem={3}
        titulo="Seu aplicativo atualizado, monitorado e no ar."
        tom="petroleo"
      />,
    )
    expect(screen.getByText('Planos de manutenção')).toHaveClass(
      'text-primary-foreground',
    )
    expect(screen.getByText('03')).toHaveClass('text-primary-foreground')
    expect(container.querySelector('.h-px')).toHaveClass('bg-petroleo-linha')
  })

  it('o texto de apoio vem depois do título', () => {
    render(
      <CabecalhoSecao id="b" rotulo="Planos" contagem={3} titulo="Título">
        <p>Planos mensais.</p>
      </CabecalhoSecao>,
    )
    const titulo = screen.getByRole('heading', { level: 2 })
    const apoio = screen.getByText('Planos mensais.')
    expect(
      titulo.compareDocumentPosition(apoio) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  // Review Focus 1: a 320 px, palavra longa quebra em vez de vazar para o gutter.
  it('o título quebra palavra longa em vez de vazar', () => {
    render(<CabecalhoSecao id="c" rotulo="R" contagem={1} titulo="T" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass(
      'wrap-break-word',
    )
  })
})
