import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PrimeiroUso } from './primeiro-uso'

describe('PrimeiroUso (1a)', () => {
  it('explica o primeiro uso com os textos do design e o texto novo do cartão', () => {
    render(<PrimeiroUso onGerar={vi.fn()} />)
    expect(screen.getByText('Primeiro uso')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Ainda não há pessoa de teste',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Gere uma pessoa brasileira falsa e coerente. CPF, CNPJ, CEP e cartão passam na validação. Ela fica guardada até você pedir outra.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('dígito verificador correto')).toBeInTheDocument()
    expect(
      screen.getByText('existe, e rua, bairro e cidade batem'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('número de teste documentado, Luhn válido'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/faixa de sandbox/)).toBeNull()
  })

  it('"Gerar pessoa" chama onGerar', async () => {
    const gerar = vi.fn()
    render(<PrimeiroUso onGerar={gerar} />)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Gerar pessoa' }))
    expect(gerar).toHaveBeenCalledTimes(1)
  })
})
