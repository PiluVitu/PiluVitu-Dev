import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectarNavegador, PAGINA_DE_ATALHOS } from './navegador'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// No Vitest, import.meta.env.FIREFOX/OPERA ficam undefined e o jsdom não tem userAgentData:
// o padrão é o ramo do zip do Chrome. Cada teste liga só o que precisa.
const comMarcas = (...marcas: string[]) =>
  vi.stubGlobal('navigator', {
    userAgentData: {
      brands: marcas.map((brand) => ({ brand, version: '141' })),
    },
  })

describe('detectarNavegador', () => {
  it('sem constante de build nem userAgentData, é o Chrome', () => {
    expect(detectarNavegador()).toBe('chrome')
  })

  it('o build do Firefox se identifica pela constante, sem olhar o agente', () => {
    vi.stubEnv('FIREFOX', 'true')
    comMarcas('Microsoft Edge', 'Chromium')
    expect(detectarNavegador()).toBe('firefox')
  })

  it('o build do Opera se identifica pela constante', () => {
    vi.stubEnv('OPERA', 'true')
    expect(detectarNavegador()).toBe('opera')
  })

  it.each([
    [['Chromium', 'Microsoft Edge', 'Not.A/Brand'], 'edge'],
    [['Opera', 'Chromium', 'Not=A?Brand'], 'opera'],
    [['Opera GX', 'Chromium'], 'opera'],
    [['Google Chrome', 'Chromium', 'Not;A=Brand'], 'chrome'],
  ] as const)('no zip do Chrome, as marcas %j viram %s', (marcas, esperado) => {
    comMarcas(...marcas)
    expect(detectarNavegador()).toBe(esperado)
  })

  it('Chromium de marca desconhecida (Brave) ou sem userAgentData cai no Chrome', () => {
    comMarcas('Brave', 'Chromium')
    expect(detectarNavegador()).toBe('chrome')
    vi.stubGlobal('navigator', {})
    expect(detectarNavegador()).toBe('chrome')
  })
})

describe('PAGINA_DE_ATALHOS', () => {
  it('os três Chromium abrem a página de atalhos do Chromium', () => {
    expect(PAGINA_DE_ATALHOS).toEqual({
      chrome: 'chrome://extensions/shortcuts',
      edge: 'chrome://extensions/shortcuts',
      opera: 'chrome://extensions/shortcuts',
    })
  })
})
