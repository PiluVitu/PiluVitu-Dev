import { atelierApi } from './api'

describe('atelierApi', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  it('proofread desembrulha o envelope e devolve corrected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: { corrected: 'texto ok' },
        notifications: [],
      }),
    }) as unknown as typeof fetch

    const res = await atelierApi.proofread('txto')
    expect(res.corrected).toBe('texto ok')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body)).toEqual({ text: 'txto', careful: false })
  })

  it('lança ApiError em status !ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        ok: false,
        data: null,
        notifications: [
          { type: 'error', code: 'llm_unavailable', message: 'off' },
        ],
      }),
    }) as unknown as typeof fetch

    await expect(atelierApi.proofread('x')).rejects.toMatchObject({
      status: 503,
      code: 'llm_unavailable',
    })
  })
})
