import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PopupShell } from './popup-shell'

describe('PopupShell', () => {
  it('desenha marca, nome e pílula do host em volta do conteúdo', () => {
    render(
      <PopupShell host="localhost:3000" status="ok">
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
      >
        <p />
      </PopupShell>,
    )
    expect(screen.getByRole('contentinfo')).toHaveTextContent('rodapé')
    rerender(
      <PopupShell host="chrome://settings" status="lock">
        <p />
      </PopupShell>,
    )
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })
})
