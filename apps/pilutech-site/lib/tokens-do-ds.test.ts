import { hslParaHex, rgbDoToken, tokenDoDs } from './tokens-do-ds'

describe('tokenDoDs', () => {
  // As cores do design (marca-CLAUDE.md) são estes tokens do @piluvitu/ui.
  it('lê o triplo HSL do tema escuro e do claro', () => {
    expect(tokenDoDs('escuro', 'background')).toBe('220 33% 5%')
    expect(tokenDoDs('escuro', 'primary')).toBe('198 93% 60%')
    expect(tokenDoDs('claro', 'primary')).toBe('198 93% 26%')
    expect(tokenDoDs('claro', 'background')).toBe('220 50% 98%')
  })

  it('não confunde --primary com --primary-foreground', () => {
    expect(tokenDoDs('escuro', 'primary-foreground')).toBe('200 75% 6%')
  })

  it('token que não existe lança, em vez de devolver vazio', () => {
    expect(() => tokenDoDs('escuro', 'nao-existe')).toThrow(/--nao-existe/)
  })
})

describe('hslParaHex', () => {
  it.each([
    ['220 33% 5%', '#090b11'],
    ['198 93% 60%', '#3abff8'],
    ['215 33% 93%', '#e7ecf3'],
    ['216 17% 64%', '#94a0b3'],
  ])('%s → %s', (triplo, hex) => {
    expect(hslParaHex(triplo)).toBe(hex)
  })
})

// Os E2E comparam com o getComputedStyle do Chromium, que devolve rgb(r, g, b).
describe('rgbDoToken', () => {
  it.each([
    ['escuro', 'background', 'rgb(9, 11, 17)'],
    ['escuro', 'primary', 'rgb(58, 191, 248)'],
    ['claro', 'background', 'rgb(247, 249, 252)'],
    ['claro', 'primary', 'rgb(5, 91, 128)'],
  ] as const)('%s/%s → %s', (tema, nome, rgb) => {
    expect(rgbDoToken(tema, nome)).toBe(rgb)
  })
})
