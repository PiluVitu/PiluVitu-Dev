import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Ajuda } from './ajuda'

const CONTEUDO = 'Mês de referência da despesa, não a data do pagamento.'

describe('Ajuda', () => {
  test('não renderiza o conteúdo no DOM antes de abrir', () => {
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    expect(screen.queryByText(CONTEUDO)).not.toBeInTheDocument()
  })

  test('o gatilho é um button com aria-label derivado de rotulo (não é um "?" mudo)', () => {
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    const gatilho = screen.getByRole('button', { name: /competência/i })
    expect(gatilho).toHaveAttribute('type', 'button')
  })

  test('abre o conteúdo ao clicar no gatilho', async () => {
    const user = userEvent.setup()
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    await user.click(screen.getByRole('button', { name: /competência/i }))

    expect(await screen.findByText(CONTEUDO)).toBeInTheDocument()
  })

  test('hover no gatilho, sem clique, não abre o conteúdo', async () => {
    const user = userEvent.setup()
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    await user.hover(screen.getByRole('button', { name: /competência/i }))

    expect(screen.queryByText(CONTEUDO)).not.toBeInTheDocument()
  })

  test('fecha com Esc depois de aberto por clique', async () => {
    const user = userEvent.setup()
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    await user.click(screen.getByRole('button', { name: /competência/i }))
    expect(await screen.findByText(CONTEUDO)).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByText(CONTEUDO)).not.toBeInTheDocument()
  })
})
