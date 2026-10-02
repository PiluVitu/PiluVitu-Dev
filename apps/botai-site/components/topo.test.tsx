import { render, screen } from '@testing-library/react'
import { Topo } from './topo'

describe('Topo', () => {
  it('voltar, âncoras e o botão de tema, numa navegação', () => {
    render(
      <Topo
        voltar={{ href: 'https://pilutech.com.br', rotulo: 'PiluLabs' }}
        ancoras={[
          { href: '#como-usar', rotulo: 'como usar' },
          { href: '#capturas', rotulo: 'capturas' },
        ]}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Topo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PiluLabs' })).toHaveAttribute(
      'href',
      'https://pilutech.com.br',
    )
    expect(screen.getByRole('link', { name: 'como usar' })).toHaveAttribute(
      'href',
      '#como-usar',
    )
    expect(screen.getByRole('link', { name: 'capturas' })).toHaveAttribute(
      'href',
      '#capturas',
    )
    expect(
      screen.getByRole('button', { name: 'Alternar tema' }),
    ).toBeInTheDocument()
  })

  // A 320 px o voltar, as âncoras e o botão não cabem numa linha.
  it('quebra linha em tela estreita', () => {
    render(<Topo voltar={{ href: '/', rotulo: 'Botaí' }} />)
    expect(screen.getByRole('navigation')).toHaveClass('flex-wrap')
  })
})
