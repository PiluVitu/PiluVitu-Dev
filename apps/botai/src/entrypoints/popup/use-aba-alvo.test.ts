import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { buscarAbaAlvo } from './use-aba-alvo'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// mockImplementation, não mockResolvedValue: o spyOn pega a última sobrecarga de tabs.query (a de callback,
// que devolve void), e o mockResolvedValue([...]) não passa no tsc.
const abaAtiva = (url: string | undefined) =>
  vi
    .spyOn(fakeBrowser.tabs, 'query')
    .mockImplementation(async () => [{ id: 7, url } as Browser.tabs.Tab])

describe('buscarAbaAlvo', () => {
  it('usa a aba ativa da janela atual', async () => {
    const consulta = abaAtiva('http://localhost:3000/cadastro')
    await expect(buscarAbaAlvo('')).resolves.toEqual({
      id: 7,
      url: 'http://localhost:3000/cadastro',
      situacao: 'ok',
    })
    expect(consulta).toHaveBeenCalledWith({ active: true, currentWindow: true })
  })

  it('marca a página proibida pela URL', async () => {
    abaAtiva('chrome://settings')
    await expect(buscarAbaAlvo('')).resolves.toMatchObject({
      situacao: 'proibida',
    })
  })

  it('file: pergunta ao Chrome se o acesso a arquivos está liberado', async () => {
    abaAtiva('file:///Users/eu/form.html')
    Object.assign(fakeBrowser.extension, {
      isAllowedFileSchemeAccess: vi.fn(async () => false),
    })
    await expect(buscarAbaAlvo('')).resolves.toMatchObject({
      situacao: 'arquivo-sem-acesso',
    })
  })

  it('?aba= só vale no build e2e', async () => {
    const outra = await fakeBrowser.tabs.create({
      url: 'http://teste.local/form',
    })
    abaAtiva('http://localhost:3000/')
    await expect(buscarAbaAlvo(`?aba=${outra.id}`)).resolves.toMatchObject({
      id: 7,
    })
    vi.stubEnv('MODE', 'e2e')
    await expect(buscarAbaAlvo(`?aba=${outra.id}`)).resolves.toEqual({
      id: outra.id,
      url: 'http://teste.local/form',
      situacao: 'ok',
    })
  })

  it('sem aba devolve null', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(async () => [])
    await expect(buscarAbaAlvo('')).resolves.toBeNull()
  })
})
