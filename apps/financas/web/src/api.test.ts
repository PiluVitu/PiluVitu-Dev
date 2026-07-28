import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// I2 (fix final): api.ts importa authClient de ./auth-client pra disparar
// $sessionSignal num 401 not_authenticated. Mock leve (não o client real do
// Better Auth) — o que está sob teste aqui é só SE api.ts chama
// $store.notify, não o transporte HTTP da lib (isso já é coberto por
// Gate.test.tsx). vi.hoisted porque vi.mock é hoisted para o topo do
// arquivo, antes de qualquer const normal existir.
const { notifyFake } = vi.hoisted(() => ({ notifyFake: vi.fn() }))
vi.mock('./auth-client', () => ({
  authClient: { $store: { notify: notifyFake } },
}))

import { api, ApiError } from './api'

type FetchMock = ReturnType<typeof vi.fn>

function mockFetch(response: unknown) {
  const fn = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fn)
  return fn as FetchMock
}

function envelopeResponse(status: number, body: unknown) {
  return { status, json: async () => body }
}

beforeEach(() => {
  notifyFake.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api', () => {
  it('desembrulha o envelope e devolve data', async () => {
    const fetchMock = mockFetch(
      envelopeResponse(200, {
        ok: true,
        data: [{ id: 'a1' }],
        notifications: [],
      }),
    )

    const data = await api<Array<{ id: string }>>('/api/accounts')

    expect(data).toEqual([{ id: 'a1' }])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts',
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/json',
        }),
      }),
    )
  })

  it('lanca ApiError com status, code e message da notificacao de erro', async () => {
    mockFetch(
      envelopeResponse(409, {
        ok: false,
        data: null,
        notifications: [
          { type: 'warning', code: 'ignorar', message: 'nao é essa' },
          {
            type: 'error',
            code: 'over_allocation',
            message: 'alocacao excede o valor do item',
          },
        ],
      }),
    )

    await expect(
      api('/api/debts/d1/payments', { method: 'POST' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'over_allocation',
      message: 'alocacao excede o valor do item',
    })
  })

  it('lanca ApiError invalid_envelope quando a resposta nao é envelope', async () => {
    // Cenário real: o Cloudflare Access devolve HTML de login em vez de JSON.
    mockFetch({
      status: 302,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    })

    const err = (await api('/api/accounts').catch((e) => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('invalid_envelope')
    expect(err.status).toBe(302)
  })

  it('I2: dispara $sessionSignal via authClient.$store.notify quando 401 not_authenticated', async () => {
    mockFetch(
      envelopeResponse(401, {
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'not_authenticated',
            message: 'requisição sem sessão válida',
          },
        ],
      }),
    )

    await expect(api('/api/accounts')).rejects.toMatchObject({
      status: 401,
      code: 'not_authenticated',
    })
    expect(notifyFake).toHaveBeenCalledTimes(1)
    expect(notifyFake).toHaveBeenCalledWith('$sessionSignal')
  })

  it('I2: NÃO dispara $sessionSignal para outros erros (403 email_not_allowed)', async () => {
    mockFetch(
      envelopeResponse(403, {
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'email_not_allowed',
            message: 'este e-mail não tem acesso ao aplicativo',
          },
        ],
      }),
    )

    await expect(api('/api/accounts')).rejects.toMatchObject({
      status: 403,
      code: 'email_not_allowed',
    })
    expect(notifyFake).not.toHaveBeenCalled()
  })

  it('repassa method e body', async () => {
    const fetchMock = mockFetch(
      envelopeResponse(200, { ok: true, data: { id: 'x' }, notifications: [] }),
    )

    await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions',
      expect.objectContaining({ method: 'POST', body: '{"a":1}' }),
    )
  })
})
