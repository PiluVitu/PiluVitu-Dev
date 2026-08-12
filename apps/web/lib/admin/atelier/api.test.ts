import { atelierApi } from './api'

// `atelierBase` é lido de `process.env` no MOMENTO em que o módulo carrega
// (const de topo de arquivo, igual `apiBase` em votacao/api-client.ts) — por
// isso cada teste precisa de `jest.resetModules()` + reimport dinâmico pra
// ver o valor calculado com o env daquele teste específico.
describe('atelierBase', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('usa NEXT_PUBLIC_ATELIER_URL quando definida', async () => {
    process.env.NEXT_PUBLIC_ATELIER_URL = 'http://localhost:8080'
    const { atelierBase } = await import('./api')
    expect(atelierBase).toBe('http://localhost:8080')
  })

  it('cai no default http://localhost:8080 quando NEXT_PUBLIC_ATELIER_URL não está definida', async () => {
    delete process.env.NEXT_PUBLIC_ATELIER_URL
    const { atelierBase } = await import('./api')
    expect(atelierBase).toBe('http://localhost:8080')
  })

  it('NÃO cai no NEXT_PUBLIC_API_URL da votação — é o ponto inteiro desta task', async () => {
    // Com NEXT_PUBLIC_API_URL apontando pro ramielle (votação, fatia ④) e
    // NEXT_PUBLIC_ATELIER_URL apontando pra Go, atelierBase tem que ser a Go.
    // Se atelierBase voltar a derivar de apiBase, este teste falha — é a
    // trava de regressão contra o card "Distribuição" ficando mudo (ver
    // comentário em ./api.ts).
    process.env.NEXT_PUBLIC_API_URL = 'https://ramielle.piluvitu.com.br'
    process.env.NEXT_PUBLIC_ATELIER_URL = 'http://localhost:8080'
    const { atelierBase } = await import('./api')
    expect(atelierBase).not.toContain('ramielle')
    expect(atelierBase).toBe('http://localhost:8080')
  })
})

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
