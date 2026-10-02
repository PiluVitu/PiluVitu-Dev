import { render, screen } from '@testing-library/react'
import { TabelaAtalhos } from './tabela-atalhos'

const LEGENDA = 'Atalho para preencher a página, por navegador e sistema'

describe('TabelaAtalhos', () => {
  it('tem legenda para leitor de tela', () => {
    render(<TabelaAtalhos />)
    expect(screen.getByRole('table', { name: LEGENDA })).toBeInTheDocument()
  })

  // A 320 px a tabela (~426 px) rola dentro da moldura. Sem foco nela, quem usa teclado não rola,
  // e o axe acusa scrollable-region-focusable (serious, WCAG 2.1.1).
  it('a moldura que rola é uma região focável, com o nome da legenda', () => {
    render(<TabelaAtalhos />)
    const regiao = screen.getByRole('region', { name: LEGENDA })
    expect(regiao).toHaveAttribute('tabindex', '0')
    expect(regiao).toHaveClass('overflow-x-auto', 'focus-visible:ring-2')
  })

  it('colunas de navegador, Windows, macOS e Linux', () => {
    render(<TabelaAtalhos />)
    expect(
      screen.getAllByRole('columnheader').map((th) => th.textContent),
    ).toEqual(['Navegador', 'Windows', 'macOS', 'Linux'])
  })

  // É o que a página publica: o Firefox no Linux é a exceção do manifesto.
  it('uma linha por navegador, com o atalho de cada sistema', () => {
    render(<TabelaAtalhos />)
    const [, ...linhas] = screen.getAllByRole('row')
    expect(
      linhas.map((linha) =>
        [...linha.querySelectorAll('th, td')].map((c) => c.textContent),
      ),
    ).toEqual([
      ['Chrome', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Edge', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Opera', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Firefox', 'Ctrl+Shift+Y', '⌥⇧P', 'Alt+Shift+P'],
    ])
  })
})
