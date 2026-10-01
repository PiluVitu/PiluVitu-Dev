import { sfc32 } from './prng'
import { gerarTituloEleitor, validarTituloEleitor } from './titulo-eleitor'
import { UFS, CODIGO_UF_TITULO } from './uf'
import { sementes } from './rng-teste'

describe('Título de eleitor', () => {
  test('exemplo da Wikipédia (SC): 0043 5687 0906', () => {
    expect(validarTituloEleitor('0043 5687 0906', 'sem-excecao')).toBe(true)
    expect(validarTituloEleitor('0043 5687 0906', 'com-excecao-sp-mg')).toBe(
      true,
    )
  })

  test('caso SP em que as duas leituras da regra divergem', () => {
    expect(validarTituloEleitor('0000 0014 0108', 'sem-excecao')).toBe(true)
    expect(validarTituloEleitor('0000 0014 0108', 'com-excecao-sp-mg')).toBe(
      false,
    )
    expect(validarTituloEleitor('0000 0014 0116', 'com-excecao-sp-mg')).toBe(
      true,
    )
  })

  test.each([...UFS, 'ZZ' as const])(
    'código da UF %s nas posições 9-10',
    (uf) => {
      const t = gerarTituloEleitor(sfc32(9, 9, 9, 9), uf).replace(/\s/g, '')
      expect(t.slice(8, 10)).toBe(CODIGO_UF_TITULO[uf])
    },
  )

  test('SP e MG: 2000 sementes válidas nas DUAS leituras da regra', () => {
    for (const r of sementes(2000)) {
      for (const uf of ['SP', 'MG'] as const) {
        const t = gerarTituloEleitor(r, uf)
        expect(t).toMatch(/^\d{4} \d{4} \d{4}$/)
        expect(validarTituloEleitor(t, 'sem-excecao')).toBe(true)
        expect(validarTituloEleitor(t, 'com-excecao-sp-mg')).toBe(true)
      }
    }
  })

  test('rejeita código de UF fora de 01..28', () => {
    expect(validarTituloEleitor('0043 5687 2906')).toBe(false)
    expect(validarTituloEleitor('0043 5687 0006')).toBe(false)
  })
})
