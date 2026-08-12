import {
  apiBase,
  ApiError,
  errorMessage,
  startGoogleLogin,
  votacaoApi,
} from './api-client'
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
    await expect(votacaoApi.vote(1, [3])).rejects.toMatchObject({
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

describe('startGoogleLogin', () => {
  function mockSignInSocial(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: `HTTP ${status}`,
      json: async () => body,
    } as Response)
  }

  // O login NÃO usa GET /auth/google/login (essa rota não existe no
  // ramielle — cai no catch-all, 404). O fluxo novo é POST
  // /api/auth/sign-in/social (Better Auth). Esta é a trava de regressão
  // pedida pelo brief da Task 2: reverter startGoogleLogin pra montar
  // `${apiBase}/auth/google/login` (a rota antiga) faz este teste falhar.
  it('não usa GET /auth/google/login (rota que não existe no ramielle — 404)', async () => {
    mockSignInSocial(200, {
      url: 'https://accounts.google.com/o/oauth2/v2/auth?...',
      redirect: true,
    })
    const navigate = jest.fn()
    await startGoogleLogin({ navigate })

    const fetchMock = global.fetch as jest.Mock
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).not.toContain('/auth/google/login')
    expect(url).toBe(`${apiBase}/api/auth/sign-in/social`)
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
  })

  it('manda provider google + callbackURL/errorCallbackURL absolutas (página atual)', async () => {
    mockSignInSocial(200, {
      url: 'https://accounts.google.com/x',
      redirect: true,
    })
    await startGoogleLogin({ navigate: jest.fn() })

    const fetchMock = global.fetch as jest.Mock
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      provider: 'google',
      callbackURL: window.location.href,
      errorCallbackURL: window.location.href,
    })
  })

  it('navega pra URL devolvida pelo Better Auth em caso de sucesso', async () => {
    mockSignInSocial(200, {
      url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
      redirect: true,
    })
    const navigate = jest.fn()
    await startGoogleLogin({ navigate })
    expect(navigate).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
    )
  })

  it('lança erro tratável (não navega) quando a resposta não é 2xx', async () => {
    mockSignInSocial(500, { message: 'boom' })
    const navigate = jest.fn()
    await expect(startGoogleLogin({ navigate })).rejects.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('lança erro tratável (não navega) quando a resposta não tem `url`', async () => {
    mockSignInSocial(200, { redirect: false })
    const navigate = jest.fn()
    await expect(startGoogleLogin({ navigate })).rejects.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('lança erro tratável (não navega) quando o fetch falha (rede fora)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'))
    const navigate = jest.fn()
    await expect(startGoogleLogin({ navigate })).rejects.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })
})
