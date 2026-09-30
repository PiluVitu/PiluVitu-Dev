import { atelierApi } from './api'

// `atelierBase` é lido de `process.env` no MOMENTO em que o módulo carrega
// (const de topo de arquivo, igual `apiBase` em votacao/api-client.ts) — por
// isso cada teste precisa de `jest.resetModules()` + reimport dinâmico pra
// ver o valor calculado com o env daquele teste específico.
describe('atelierBase', () => {
  const ORIGINAL_ENV = process.env

  // Valor DELIBERADAMENTE diferente do default (`http://localhost:8080`).
  // Fix round 1 (revisão): os testes originais usavam o mesmo valor do
  // default pra "env definida" — aí uma implementação hardcoded
  // (`export const atelierBase = 'http://localhost:8080'`, ignorando
  // `process.env` por completo) passava nos 3 testes igual. Usando um valor
  // distinguível aqui, só passa quem de fato LÊ `NEXT_PUBLIC_ATELIER_URL`.
  const VALOR_DISTINTO_DO_DEFAULT = 'http://localhost:9999'

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('usa NEXT_PUBLIC_ATELIER_URL quando definida', async () => {
    process.env.NEXT_PUBLIC_ATELIER_URL = VALOR_DISTINTO_DO_DEFAULT
    const { atelierBase } = await import('./api')
    expect(atelierBase).toBe(VALOR_DISTINTO_DO_DEFAULT)
  })

  it('cai no default http://localhost:8080 quando NEXT_PUBLIC_ATELIER_URL não está definida', async () => {
    delete process.env.NEXT_PUBLIC_ATELIER_URL
    const { atelierBase } = await import('./api')
    expect(atelierBase).toBe('http://localhost:8080')
  })

  it('NÃO cai no NEXT_PUBLIC_API_URL da votação — é o ponto inteiro desta task', async () => {
    // Com NEXT_PUBLIC_API_URL apontando pro ramielle (votação, fatia ④) e
    // NEXT_PUBLIC_ATELIER_URL apontando pra Go (valor distinto do default,
    // pelo mesmo motivo do teste acima), atelierBase tem que ser a Go. Se
    // atelierBase voltar a derivar de apiBase, este teste falha — é a trava
    // de regressão contra o card "Distribuição" ficando mudo (ver
    // comentário em ./api.ts).
    process.env.NEXT_PUBLIC_API_URL = 'https://ramielle.piluvitu.com.br'
    process.env.NEXT_PUBLIC_ATELIER_URL = VALOR_DISTINTO_DO_DEFAULT
    const { atelierBase } = await import('./api')
    expect(atelierBase).not.toContain('ramielle')
    expect(atelierBase).toBe(VALOR_DISTINTO_DO_DEFAULT)
  })
})

// A transcrição só existe no ramielle; `atelierBase` ainda aponta pra Go
// até o dono decidir o cutover do Atelier. Por isso ela usa `apiBase`, que é
// o ramielle — e é onde mora o cookie de sessão do admin.
describe('transcrever usa a base do ramielle, não a do Atelier', () => {
  const ORIGINAL_ENV = process.env
  const realFetch = global.fetch

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_API_URL: 'https://ramielle.exemplo.test',
      NEXT_PUBLIC_ATELIER_URL: 'https://go.exemplo.test',
    }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
    global.fetch = realFetch
  })

  it('chama NEXT_PUBLIC_API_URL + /admin/transcrever', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: {}, notifications: [] }),
    }) as unknown as typeof fetch
    const { atelierApi: api } = await import('./api')

    await api.transcrever([new File(['a'], 'a.ogg')], {
      termos: '',
      modo: 'preciso',
    })

    const [url] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://ramielle.exemplo.test/admin/transcrever')
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

  // O navegador só gera o `multipart/form-data; boundary=...` se ninguém
  // definir Content-Type; forçar JSON faz o servidor não achar áudio nenhum.
  it('transcrever manda multipart na ordem, sem Content-Type forçado', async () => {
    const data = { partes: [], texto: 'oi', modelo: 'm' }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data, notifications: [] }),
    }) as unknown as typeof fetch

    const a = new File(['a'], 'a.ogg')
    const b = new File(['b'], 'b.ogg')
    const res = await atelierApi.transcrever([a, b], {
      termos: 'ramielle',
      modo: 'rapido',
    })
    expect(res).toEqual(data)

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/\/admin\/transcrever$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    const headers = new Headers(init.headers)
    expect(headers.has('Content-Type')).toBe(false)
    const form = init.body as FormData
    expect(form.getAll('audios').map((f) => (f as File).name)).toEqual([
      'a.ogg',
      'b.ogg',
    ])
    expect(form.get('termos')).toBe('ramielle')
    expect(form.get('modo')).toBe('rapido')
  })

  it('transcrever omite termos em branco', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: {}, notifications: [] }),
    }) as unknown as typeof fetch

    await atelierApi.transcrever([new File(['a'], 'a.ogg')], {
      termos: '   ',
      modo: 'preciso',
    })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect((init.body as FormData).has('termos')).toBe(false)
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
