import type { Sistema } from '@piluvitu/tools/pilulabs'
import {
  atalhoDoVisitante,
  ehFirefox,
  sistemaDoVisitante,
  VISITANTE_DO_SERVIDOR,
  type NavegadorDoVisitante,
} from './visitante'

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const CHROME_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36'
const CHROMEOS =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

const CASOS: [string, NavegadorDoVisitante, Sistema][] = [
  [
    'Mac pelo userAgentData',
    {
      userAgent: CHROME_MAC,
      platform: 'MacIntel',
      userAgentData: { platform: 'macOS' },
    },
    'mac',
  ],
  [
    'Mac sem userAgentData (Safari, Firefox)',
    { userAgent: CHROME_MAC, platform: 'MacIntel' },
    'mac',
  ],
  [
    'Windows',
    {
      userAgent: CHROME_WINDOWS,
      platform: 'Win32',
      userAgentData: { platform: 'Windows' },
    },
    'windows',
  ],
  [
    'Linux',
    {
      userAgent: CHROME_LINUX,
      platform: 'Linux x86_64',
      userAgentData: { platform: 'Linux' },
    },
    'linux',
  ],
  [
    'Firefox no Linux',
    { userAgent: FIREFOX_LINUX, platform: 'Linux x86_64' },
    'linux',
  ],
  // O navigator.platform do Android diz "Linux": sem a exceção, o celular veria o atalho do Firefox para Linux.
  [
    'Android',
    { userAgent: CHROME_ANDROID, platform: 'Linux armv81' },
    'windows',
  ],
  [
    'ChromeOS, que usa o atalho padrão do manifesto',
    {
      userAgent: CHROMEOS,
      platform: 'Linux x86_64',
      userAgentData: { platform: 'Chrome OS' },
    },
    'windows',
  ],
  ['sem pista nenhuma', { userAgent: '' }, 'windows'],
]

describe('sistemaDoVisitante', () => {
  it.each(CASOS)('%s', (_caso, navegador, esperado) => {
    expect(sistemaDoVisitante(navegador)).toBe(esperado)
  })
})

describe('ehFirefox', () => {
  it('reconhece o Firefox pelo userAgent', () => {
    expect(ehFirefox({ userAgent: FIREFOX_LINUX })).toBe(true)
    expect(ehFirefox({ userAgent: CHROME_LINUX })).toBe(false)
  })
})

describe('atalhoDoVisitante', () => {
  it.each([
    ['mac', false, '⌥⇧P', 'macOS'],
    ['mac', true, '⌥⇧P', 'macOS'],
    ['windows', false, 'Ctrl+Shift+Y', 'Windows'],
    ['windows', true, 'Ctrl+Shift+Y', 'Windows'],
    ['linux', false, 'Ctrl+Shift+Y', 'Linux'],
    ['linux', true, 'Alt+Shift+P', 'Linux'],
  ] as const)('%s, Firefox %s: %s no %s', (sistema, firefox, tecla, nome) => {
    expect(atalhoDoVisitante(sistema, firefox)).toEqual({
      tecla,
      nomeDoSistema: nome,
    })
  })

  // O HTML do servidor não sabe quem visita: sai o atalho mais comum, trocado depois da hidratação.
  it('o servidor renderiza o do Windows', () => {
    expect(VISITANTE_DO_SERVIDOR).toEqual({
      sistema: 'windows',
      firefox: false,
    })
  })
})
