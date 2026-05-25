import { ApiError, errorMessage, votacaoApi } from './api-client'
import type { ApiNotification } from './api-client'

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  } as Response)
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('ApiError', () => {
  it('uses the first error notification for message and code', () => {
    const notifications: ApiNotification[] = [
      { type: 'info', message: 'fyi' },
      {
        type: 'error',
        code: 'already_voted',
        message: 'Você já votou nesta sessão.',
      },
    ]
    const err = new ApiError(409, notifications)
    expect(err.message).toBe('Você já votou nesta sessão.')
    expect(err.code).toBe('already_voted')
    expect(err.status).toBe(409)
    expect(err.notifications).toHaveLength(2)
  })

  it('falls back to a generic message when no notifications', () => {
    const err = new ApiError(500, [])
    expect(err.message).toBe('Erro 500')
  })
})

describe('errorMessage', () => {
  it('reads ApiError.message (clean, no "Error:" prefix)', () => {
    const err = new ApiError(409, [
      {
        type: 'error',
        code: 'already_voted',
        message: 'Você já votou nesta sessão.',
      },
    ])
    expect(errorMessage(err)).toBe('Você já votou nesta sessão.')
  })

  it('reads a plain Error message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('falls back for unknown values', () => {
    expect(errorMessage('nope')).toBe('Erro inesperado. Tente novamente.')
  })
})

describe('call (via votacaoApi)', () => {
  it('unwraps the envelope data on success', async () => {
    mockFetch(200, {
      ok: true,
      data: { sessions: [{ ID: 1, Title: 'Sexta' }] },
      notifications: [],
    })
    const out = await votacaoApi.listSessions()
    expect(out.sessions).toHaveLength(1)
    expect(out.sessions[0].Title).toBe('Sexta')
  })

  it('throws ApiError carrying the notification message on failure', async () => {
    mockFetch(409, {
      ok: false,
      data: null,
      notifications: [
        {
          type: 'error',
          code: 'already_voted',
          message: 'Você já votou nesta sessão.',
        },
      ],
    })
    await expect(votacaoApi.vote(1, 3)).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'already_voted',
      message: 'Você já votou nesta sessão.',
    })
  })

  it('still throws a usable ApiError when the body is not an envelope', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)
    await expect(votacaoApi.listSessions()).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
    })
  })
})
