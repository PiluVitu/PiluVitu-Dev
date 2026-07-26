import { parseBRL } from '@piluvitu/tools/money'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NovoItemForm } from './NovoItemForm'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ ok: true, data: { id: 'it1' }, notifications: [] }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NovoItemForm', () => {
  it('posta o item em centavos e avisa o pai', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NovoItemForm debtId="d1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText('Descrição'), 'Steam Deck OLED 1TB')
    await user.clear(screen.getByLabelText('Valor'))
    await user.type(screen.getByLabelText('Valor'), '2.800,00')
    await user.clear(screen.getByLabelText('Data'))
    await user.type(screen.getByLabelText('Data'), '2026-03-05')
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/debts/d1/items')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      description: 'Steam Deck OLED 1TB',
      amount_cents: parseBRL('2.800,00'),
      incurred_on: '2026-03-05',
    })
  })

  it('barra valor invalido sem chamar a API', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NovoItemForm debtId="d1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText('Descrição'), 'Jantar')
    await user.type(screen.getByLabelText('Valor'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('valor inválido')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
