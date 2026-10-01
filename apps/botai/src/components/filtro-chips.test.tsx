import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FiltroChips } from './filtro-chips'

const OPCOES = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'cartao', rotulo: 'Cartão' },
] as const

describe('FiltroChips', () => {
  it('marca o chip ativo com aria-pressed', () => {
    render(<FiltroChips opcoes={OPCOES} ativo="cartao" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cartão' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Tudo' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('clicar troca o filtro', async () => {
    const trocar = vi.fn()
    render(<FiltroChips opcoes={OPCOES} ativo="tudo" onChange={trocar} />)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cartão' }))
    expect(trocar).toHaveBeenCalledWith('cartao')
  })
})
