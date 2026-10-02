import {
  BLOCOS_DA_MARCA,
  CORES_DA_MARCA,
  LADO_DO_APPLE_ICON,
  LADO_DO_ICONE,
  NOME_DA_MARCA,
  proporcoesDoLockup,
} from './marca'
import { hslParaHex, tokenDoDs } from './tokens-do-ds'

describe('símbolo da PiluTech, variante 1a (PiluTechMark.dc.html)', () => {
  it('o P de 5 blocos de 14 no quadro de 48', () => {
    expect(BLOCOS_DA_MARCA).toEqual([
      { x: 8.5, y: 0, destaque: false },
      { x: 25.5, y: 0, destaque: true },
      { x: 8.5, y: 17, destaque: false },
      { x: 25.5, y: 17, destaque: false },
      { x: 8.5, y: 34, destaque: false },
    ])
  })

  it('só o bloco de cima à direita é o destaque', () => {
    expect(BLOCOS_DA_MARCA.filter((b) => b.destaque)).toEqual([
      { x: 25.5, y: 0, destaque: true },
    ])
  })

  it('o nome da marca', () => {
    expect(NOME_DA_MARCA).toBe('PiluTech')
  })

  // O design: gap = round(size * 0.28) e a palavra a round(size * 0.6).
  it.each([
    [30, { espaco: 8, palavra: 18 }],
    [28, { espaco: 8, palavra: 17 }],
    [120, { espaco: 34, palavra: 72 }],
  ])('lockup de %i px', (tamanho, esperado) => {
    expect(proporcoesDoLockup(tamanho)).toEqual(esperado)
  })

  // As imagens (favicon, apple-icon, OG) não têm CSS: o hex tem de ser o do .dark do @piluvitu/ui.
  it.each([
    ['noite', 'background'],
    ['texto', 'foreground'],
    ['ciano', 'primary'],
    ['aco', 'muted-foreground'],
  ] as const)('CORES_DA_MARCA.%s é o --%s do tema escuro', (cor, token) => {
    expect(CORES_DA_MARCA[cor]).toBe(hslParaHex(tokenDoDs('escuro', token)))
  })

  // O Google pede favicon quadrado em múltiplo de 48 px; o iOS usa 180.
  it('favicon de 192 px e apple-icon de 180 px', () => {
    expect(LADO_DO_ICONE).toBe(192)
    expect(LADO_DO_ICONE % 48).toBe(0)
    expect(LADO_DO_APPLE_ICON).toBe(180)
  })
})
