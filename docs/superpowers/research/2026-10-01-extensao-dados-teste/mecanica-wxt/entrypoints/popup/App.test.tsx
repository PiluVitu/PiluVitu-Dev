// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { App } from './App'

beforeEach(() => fakeBrowser.reset())

it('Gerar pessoa grava no storage e o popup re-renderiza via watch', async () => {
  render(<App />)
  expect(await screen.findByText('Ainda não há pessoa de teste')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Gerar pessoa' }))
  expect((await screen.findByTestId('nome')).textContent).toBe(
    'Maria Eduarda Souza',
  )
})
