import { render, screen } from '@testing-library/react'
import { CabecalhoSecao } from './cabecalho-secao'

describe('CabecalhoSecao', () => {
  // A seção aponta para ele com aria-labelledby.
  it('é um h2 com o id recebido', () => {
    render(<CabecalhoSecao id="recursos-heading" rotulo="O que ele bota" />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'O que ele bota' }),
    ).toHaveAttribute('id', 'recursos-heading')
  })

  it('a contagem sai com dois dígitos, fora do título', () => {
    render(
      <CabecalhoSecao id="capturas-heading" rotulo="Capturas" contagem={3} />,
    )
    expect(screen.getByText('03')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /^Capturas$/,
    )
  })

  it('sem contagem, nenhum número', () => {
    const { container } = render(
      <CabecalhoSecao id="uso-heading" rotulo="Como usar" />,
    )
    expect(container.textContent).toBe('Como usar')
  })
})
