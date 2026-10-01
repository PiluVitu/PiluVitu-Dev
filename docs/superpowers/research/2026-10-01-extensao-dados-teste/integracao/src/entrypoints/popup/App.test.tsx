import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { App } from './App'

it('mostra o CPF da pessoa persistida', async () => {
  render(<App />)
  expect(
    await screen.findByText(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Preencher página' }),
  ).toBeInTheDocument()
})
