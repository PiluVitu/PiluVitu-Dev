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

  it('sem Data preenchida, usa o dia de Teresina (nao UTC) como default', async () => {
    // 01:00 UTC de 01/08 e 22h de 31/07 em Teresina (UTC-3). Fake so o Date
    // (nao os timers): waitFor/userEvent usam setTimeout de verdade por
    // baixo, e travariam se o relogio inteiro estivesse congelado.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T01:00:00Z'))
    try {
      const user = userEvent.setup()
      const onCreated = vi.fn()
      render(<NovoItemForm debtId="d1" onCreated={onCreated} />)

      await user.type(screen.getByLabelText('Descrição'), 'Item tardio')
      await user.clear(screen.getByLabelText('Valor'))
      await user.type(screen.getByLabelText('Valor'), '10,00')
      await user.click(screen.getByRole('button', { name: 'Adicionar item' }))

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(String(init.body)).incurred_on).toBe('2026-07-31')
    } finally {
      vi.useRealTimers()
    }
  })

  // O 7º call site de `mutarERecarregar` — o que passou batido no grep por
  // "await carregar()", porque aqui a recarga se chama `onCreated()`.
  // `onCreated` é o `carregar` de debt-detail.tsx: um Promise.all de dois
  // GETs que LANÇAM. Reenviar duplica o item, e o total da dívida é a SOMA
  // dos itens — a duplicata infla o Comprometido.
  it('POST 201 mas recarga (onCreated) falhou: diz que o item FOI criado e avisa pra nao reenviar', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    render(<NovoItemForm debtId="d1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText('Descrição'), 'MacBook Air M4')
    await user.clear(screen.getByLabelText('Valor'))
    await user.type(screen.getByLabelText('Valor'), '4.500,00')
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))

    const alerta = await screen.findByRole('alert')

    // A mutação ACONTECEU: o POST saiu, e o alerta afirma isso.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(alerta).toHaveTextContent(/foi criado/i)

    // Nomeia o que o dono digitou (o formulário já está limpo).
    expect(alerta).toHaveTextContent('MacBook Air M4')
    expect(alerta).toHaveTextContent('R$ 4.500,00')

    // Diz o que fazer agora, e proíbe o reenvio nomeando o estrago.
    expect(alerta).toHaveTextContent(/atualize a página/i)
    expect(alerta).toHaveTextContent(/não envie de novo/i)
    expect(alerta).toHaveTextContent(/duplicad/i)
    expect(alerta).toHaveTextContent(/inflad/i)

    // NUNCA pode ler como falha da ação, nem repassar a mensagem do GET.
    expect(alerta).not.toHaveTextContent(/falh/i)
    expect(alerta).not.toHaveTextContent(/Failed to fetch/)

    // Formulário limpo (limpar mora DENTRO do callback de mutação, logo
    // após o 2xx) — deixá-lo preenchido é o que convida ao reenvio.
    expect(screen.getByLabelText('Descrição')).toHaveValue('')
    expect(screen.getByLabelText('Valor')).toHaveValue('')
  })

  it('falha REAL do POST continua mostrando a mensagem do servidor', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          data: null,
          notifications: [
            {
              type: 'error',
              code: 'constraint_violation',
              message: 'Referência inválida: a dívida informada não existe.',
            },
          ],
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      ),
    )

    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NovoItemForm debtId="d1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText('Descrição'), 'Item órfão')
    await user.clear(screen.getByLabelText('Valor'))
    await user.type(screen.getByLabelText('Valor'), '10,00')
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'Referência inválida: a dívida informada não existe.',
    )
    // Falha de MUTAÇÃO: nada foi criado, então nada de "foi criado" nem de
    // aviso de duplicata — e a recarga nunca chega a ser tentada.
    expect(alerta).not.toHaveTextContent(/foi criado/i)
    expect(onCreated).not.toHaveBeenCalled()
    // Formulário PRESERVADO: o item não existe, reenviar é o certo.
    expect(screen.getByLabelText('Descrição')).toHaveValue('Item órfão')
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
