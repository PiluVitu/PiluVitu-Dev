import { afterEach, describe, expect, it, vi } from 'vitest'
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
