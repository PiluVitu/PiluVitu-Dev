import { config } from '@fortawesome/fontawesome-svg-core'
import { render, screen } from '@testing-library/react'
import { TemaProvider } from './tema-provider'

describe('TemaProvider', () => {
  it('renderiza os filhos', () => {
    render(
      <TemaProvider>
        <p>conteúdo</p>
      </TemaProvider>,
    )
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  // O provider está em toda página: é ele quem desliga o CSS injetado do Font Awesome no cliente.
  it('desliga o CSS injetado do Font Awesome', () => {
    expect(config.autoAddCss).toBe(false)
  })
})
