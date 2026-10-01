import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconeTile } from './icone-tile'

describe('IconeTile', () => {
  it('é neutro por padrão, com o ícone dentro', () => {
    render(
      <IconeTile>
        <span>ícone</span>
      </IconeTile>,
    )
    expect(screen.getByText('ícone').parentElement).toHaveClass(
      'bg-card',
      'text-muted-foreground',
    )
  })

  it('no tom ok fica verde', () => {
    render(
      <IconeTile tom="ok">
        <span>ícone</span>
      </IconeTile>,
    )
    expect(screen.getByText('ícone').parentElement).toHaveClass(
      'bg-ok/12',
      'text-ok',
    )
  })
})
