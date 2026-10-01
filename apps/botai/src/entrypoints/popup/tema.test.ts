import { afterEach, describe, expect, it, vi } from 'vitest'

// tema.ts roda no import (é o primeiro import do popup); cada teste reimporta o módulo.
function simularPreferencia(escuro: boolean) {
  const ouvintes: (() => void)[] = []
  const media = {
    matches: escuro,
    addEventListener: (_tipo: string, ouvinte: () => void) =>
      ouvintes.push(ouvinte),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  )
  return {
    trocar(novo: boolean) {
      media.matches = novo
      ouvintes.forEach((ouvinte) => ouvinte())
    },
  }
}

describe('tema', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    document.documentElement.classList.remove('dark')
  })

  it('aplica .dark no <html> quando o sistema está no escuro', async () => {
    simularPreferencia(true)
    await import('./tema')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('fica claro no tema claro e acompanha a troca do sistema', async () => {
    const preferencia = simularPreferencia(false)
    await import('./tema')
    expect(document.documentElement).not.toHaveClass('dark')
    preferencia.trocar(true)
    expect(document.documentElement).toHaveClass('dark')
  })
})
