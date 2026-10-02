import { render, screen, within } from '@testing-library/react'
import { Documento } from './documento'

function renderizar() {
  return render(
    <Documento
      rotulo="~/pilulabs/botai/termos"
      titulo="Termos de uso do Botaí"
      vigencia={{ iso: '2026-10-02', texto: '2 de outubro de 2026' }}
      resumo="o resumo."
    >
      <h2>Primeira seção</h2>
      <p>Corpo.</p>
    </Documento>,
  )
}

describe('Documento', () => {
  it('rótulo, h1, a data de vigência numa <time> e o resumo', () => {
    renderizar()
    expect(screen.getByText('~/pilulabs/botai/termos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Termos de uso do Botaí',
    )
    const data = screen.getByText('2 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-02')
    expect(data.parentElement).toHaveTextContent(
      'Em vigor desde 2 de outubro de 2026',
    )
    expect(screen.getByText('Em resumo:').parentElement).toHaveTextContent(
      'Em resumo: o resumo.',
    )
  })

  it('o corpo fica no article, dentro do main', () => {
    renderizar()
    const artigo = within(screen.getByRole('main')).getByRole('article')
    expect(
      within(artigo).getByRole('heading', { level: 2, name: 'Primeira seção' }),
    ).toBeInTheDocument()
  })

  it('o voltar leva à landing, e o rodapé fecha a página', () => {
    renderizar()
    expect(screen.getByRole('link', { name: 'Botaí' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })
})
