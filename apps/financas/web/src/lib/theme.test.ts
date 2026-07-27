import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { aplicarTema, temaSalvo } from './theme'

/**
 * jsdom não implementa `matchMedia` — mock mínimo que suporta
 * addEventListener/removeEventListener('change', ...) de verdade, com um
 * helper pra simular o SO mudando de tema em runtime (não só espionar se
 * addEventListener foi chamado).
 */
class MediaQueryListMock {
  matches: boolean
  private ouvintes = new Set<() => void>()

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_evento: 'change', ouvinte: () => void): void {
    this.ouvintes.add(ouvinte)
  }

  removeEventListener(_evento: 'change', ouvinte: () => void): void {
    this.ouvintes.delete(ouvinte)
  }

  get quantidadeDeOuvintes(): number {
    return this.ouvintes.size
  }

  /** Simula o SO alternando de tema — dispara os listeners registrados. */
  simularMudancaDoSistema(matches: boolean): void {
    this.matches = matches
    for (const ouvinte of this.ouvintes) ouvinte()
  }
}

let mediaQueryAtual: MediaQueryListMock

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  mediaQueryAtual = new MediaQueryListMock(false)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQueryAtual),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('temaSalvo', () => {
  test('devolve "sistema" quando nada foi salvo ainda', () => {
    expect(temaSalvo()).toBe('sistema')
  })

  test('devolve "sistema" pra um valor inválido salvo (defesa)', () => {
    localStorage.setItem('financas-tema', 'lixo')
    expect(temaSalvo()).toBe('sistema')
  })

  test('devolve o valor salvo por aplicarTema', () => {
    aplicarTema('escuro')
    expect(temaSalvo()).toBe('escuro')
  })
})

describe('aplicarTema — claro/escuro', () => {
  test('"claro" tira .dark do <html> e persiste', () => {
    document.documentElement.classList.add('dark')
    aplicarTema('claro')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(temaSalvo()).toBe('claro')
  })

  test('"escuro" põe .dark no <html> e persiste', () => {
    aplicarTema('escuro')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(temaSalvo()).toBe('escuro')
  })
})

describe('aplicarTema — sistema', () => {
  test('aplica .dark de imediato quando o SO já prefere escuro', () => {
    mediaQueryAtual.matches = true
    aplicarTema('sistema')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  test('não aplica .dark quando o SO prefere claro', () => {
    mediaQueryAtual.matches = false
    aplicarTema('sistema')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  test('reage a uma mudança do SO em runtime (não só assina o listener)', () => {
    mediaQueryAtual.matches = false
    aplicarTema('sistema')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    mediaQueryAtual.simularMudancaDoSistema(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    mediaQueryAtual.simularMudancaDoSistema(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  test('trocar de "sistema" pra "claro"/"escuro" remove o listener (sem vazar)', () => {
    aplicarTema('sistema')
    expect(mediaQueryAtual.quantidadeDeOuvintes).toBe(1)

    aplicarTema('claro')
    expect(mediaQueryAtual.quantidadeDeOuvintes).toBe(0)

    // Uma mudança do SO depois disso não deve mais mexer no <html>.
    mediaQueryAtual.simularMudancaDoSistema(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  test('chamar "sistema" duas vezes não acumula listener', () => {
    aplicarTema('sistema')
    aplicarTema('sistema')
    expect(mediaQueryAtual.quantidadeDeOuvintes).toBe(1)
  })
})
