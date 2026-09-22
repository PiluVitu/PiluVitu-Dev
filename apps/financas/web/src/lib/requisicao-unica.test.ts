import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { limparRequisicoesEmVoo } from './em-voo'
import { buscarUmaVez } from './requisicao-unica'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

afterEach(() => {
  limparRequisicoesEmVoo()
  vi.clearAllMocks()
})

describe('buscarUmaVez', () => {
  it('duas chamadas concorrentes ao mesmo path viram UMA requisição', async () => {
    vi.mocked(api).mockResolvedValue({ total: 1 })

    const [a, b] = await Promise.all([
      buscarUmaVez<{ total: number }>('/api/debts'),
      buscarUmaVez<{ total: number }>('/api/debts'),
    ])

    expect(api).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ total: 1 })
    expect(b).toEqual({ total: 1 })
  })

  it('paths diferentes não se misturam', async () => {
    vi.mocked(api).mockImplementation((path: string) =>
      Promise.resolve({ path }),
    )

    const [contas, dividas] = await Promise.all([
      buscarUmaVez<{ path: string }>('/api/accounts'),
      buscarUmaVez<{ path: string }>('/api/debts'),
    ])

    expect(api).toHaveBeenCalledTimes(2)
    expect(contas.path).toBe('/api/accounts')
    expect(dividas.path).toBe('/api/debts')
  })

  // ⚠️ O contrapositivo de "é cache": depois que a resposta chega, a
  // próxima busca vai à rede de novo. Sem este caso, um cache de verdade
  // (que faria a home mostrar número velho depois de um lançamento)
  // passaria nos dois testes acima sem ser notado.
  it('NÃO é cache: depois de assentar, a próxima chamada busca de novo', async () => {
    vi.mocked(api).mockResolvedValue({ total: 1 })

    await buscarUmaVez('/api/debts')
    await buscarUmaVez('/api/debts')

    expect(api).toHaveBeenCalledTimes(2)
  })

  it('rejeição alcança os dois que pediram juntos, e a entrada é liberada', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('caiu'))

    const a = buscarUmaVez('/api/debts')
    const b = buscarUmaVez('/api/debts')

    await expect(a).rejects.toThrow('caiu')
    await expect(b).rejects.toThrow('caiu')
    expect(api).toHaveBeenCalledTimes(1)

    // liberada: a busca seguinte não herda a rejeição anterior
    vi.mocked(api).mockResolvedValue({ total: 2 })
    await expect(buscarUmaVez('/api/debts')).resolves.toEqual({ total: 2 })
  })
})
