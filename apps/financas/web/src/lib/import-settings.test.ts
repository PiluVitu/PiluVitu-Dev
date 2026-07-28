import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { mapaSalvo, salvarMapa } from './import-settings'

// Mockar `api` (não a rede/localStorage) — mesmo padrão de config.test.tsx /
// debt-detail.test.tsx: `api` já traduz envelope/erro; testar aqui prova
// que o mapa é lido/salvo via `GET|PUT /api/settings/:key` (backend,
// chave-valor genérico), não via `localStorage`.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const apiMock = vi.mocked(api)

describe('import-settings — mapa de colunas por conta, persistido em GET|PUT /api/settings/:key', () => {
  it('sem nada salvo (value: null), devolve null — chave inclui o account_id', async () => {
    apiMock.mockResolvedValueOnce({ key: 'import_map:conta-1', value: null })
    expect(await mapaSalvo('conta-1')).toBeNull()
    expect(apiMock).toHaveBeenCalledWith('/api/settings/import_map%3Aconta-1')
  })

  it('salva via PUT com o mapa serializado em JSON dentro de { value }', async () => {
    apiMock.mockResolvedValueOnce({ key: 'import_map:conta-1', value: '' })
    const mapa = { data: 0, valor: 2, descricao: 1, temCabecalho: true }

    await salvarMapa('conta-1', mapa)

    expect(apiMock).toHaveBeenCalledWith('/api/settings/import_map%3Aconta-1', {
      method: 'PUT',
      body: JSON.stringify({ value: JSON.stringify(mapa) }),
    })
  })

  it('relê o mapa salvo — value volta como string JSON, é desserializado', async () => {
    const mapa = { data: 0, valor: 1, descricao: 2, temCabecalho: false }
    apiMock.mockResolvedValueOnce({
      key: 'import_map:conta-1',
      value: JSON.stringify(mapa),
    })

    expect(await mapaSalvo('conta-1')).toEqual(mapa)
  })

  it('contas diferentes usam chaves diferentes (import_map:<account_id>)', async () => {
    apiMock.mockResolvedValueOnce({ key: 'import_map:conta-2', value: null })

    await mapaSalvo('conta-2')

    expect(apiMock).toHaveBeenCalledWith('/api/settings/import_map%3Aconta-2')
  })

  it('value com JSON corrompido devolve null em vez de lançar', async () => {
    apiMock.mockResolvedValueOnce({
      key: 'import_map:conta-1',
      value: '{not json',
    })
    expect(await mapaSalvo('conta-1')).toBeNull()
  })

  it('shape inesperado (campo faltando) devolve null em vez de um mapa parcial', async () => {
    apiMock.mockResolvedValueOnce({
      key: 'import_map:conta-1',
      value: JSON.stringify({ data: 0, valor: 1 }),
    })
    expect(await mapaSalvo('conta-1')).toBeNull()
  })

  it('erro de rede ao ler devolve null em vez de propagar — não trava a importação', async () => {
    apiMock.mockRejectedValueOnce(
      new ApiError(503, 'auth_unavailable', 'fora do ar'),
    )
    expect(await mapaSalvo('conta-1')).toBeNull()
  })

  it('erro de rede ao salvar não lança — a importação atual continua', async () => {
    apiMock.mockRejectedValueOnce(
      new ApiError(503, 'auth_unavailable', 'fora do ar'),
    )
    await expect(
      salvarMapa('conta-1', {
        data: 0,
        valor: 1,
        descricao: 2,
        temCabecalho: false,
      }),
    ).resolves.toBeUndefined()
  })
})
