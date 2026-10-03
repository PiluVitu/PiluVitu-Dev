import { render, screen, within } from '@testing-library/react'
import { LINHAS_DO_TERMINAL } from '@/lib/conteudo'
import { Terminal } from './terminal'

describe('Terminal', () => {
  it('o comando, as 5 linhas numa lista e a agenda aberta', () => {
    render(<Terminal />)
    expect(screen.getByText(/pilutech servicos$/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(LINHAS_DO_TERMINAL.map((linha) => `✓ ${linha}`))
    expect(
      screen.getByText(/agenda aberta para novos projetos$/),
    ).toBeInTheDocument()
  })

  it('os símbolos de terminal ficam fora do leitor de tela', () => {
    const { container } = render(<Terminal />)
    const decorativos = [
      ...container.querySelectorAll('[aria-hidden="true"]'),
    ].map((e) => e.textContent)
    expect(decorativos).toEqual(expect.arrayContaining(['$', '✓', '●']))
  })
})
