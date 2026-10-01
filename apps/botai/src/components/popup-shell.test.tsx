import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PopupShell } from './popup-shell'

const CREDITO = 'Powered by PiluTech (abre pilutech.com.br)'

describe('PopupShell', () => {
  it('desenha marca, nome e pílula do host em volta do conteúdo', () => {
    render(
      <PopupShell host="localhost:3000" status="ok" onAbrirPiluTech={vi.fn()}>
        <p>conteúdo do estado</p>
      </PopupShell>,
    )
    expect(screen.getByText('Botaí')).toBeInTheDocument()
    expect(screen.getByText('dados de teste')).toBeInTheDocument()
    expect(screen.getByText('localhost:3000')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('conteúdo do estado')
  })

  it('mostra o rodapé quando recebe um, e nenhum quando não recebe', () => {
    const { rerender } = render(
      <PopupShell
        host="localhost:3000"
        status="ok"
        rodape={<footer>rodapé</footer>}
        onAbrirPiluTech={vi.fn()}
      >
        <p />
      </PopupShell>,
    )
    expect(screen.getByRole('contentinfo')).toHaveTextContent('rodapé')
    rerender(
      <PopupShell
        host="chrome://settings"
        status="lock"
        onAbrirPiluTech={vi.fn()}
      >
        <p />
      </PopupShell>,
    )
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })

  it('fecha com o crédito da PiluTech, abaixo do rodapé', () => {
    const { container } = render(
      <PopupShell
        host="localhost:3000"
        status="ok"
        rodape={<footer>rodapé</footer>}
        onAbrirPiluTech={vi.fn()}
      >
        <p />
      </PopupShell>,
    )
    const credito = screen.getByRole('button', { name: CREDITO })
    expect(
      screen.getByRole('contentinfo').compareDocumentPosition(credito) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(container.firstElementChild?.lastElementChild).toContainElement(
      credito,
    )
  })

  it('sem rodapé (1e) o crédito continua no fim, e o clique chama onAbrirPiluTech', async () => {
    const onAbrirPiluTech = vi.fn()
    const { container } = render(
      <PopupShell
        host="chrome://settings"
        status="lock"
        onAbrirPiluTech={onAbrirPiluTech}
      >
        <p />
      </PopupShell>,
    )
    const credito = screen.getByRole('button', { name: CREDITO })
    expect(container.firstElementChild?.lastElementChild).toContainElement(
      credito,
    )
    await userEvent.setup().click(credito)
    expect(onAbrirPiluTech).toHaveBeenCalledOnce()
  })
})
