import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CSS não roda em jsdom — Vitest não computa estilo real de um `<link>`/
 * `@import`, então não há como pedir `getComputedStyle` e provar que
 * `.alerta` "está vermelho" a partir de um teste de componente (o teste em
 * `commitments.test.tsx` já prova que a CLASSE é aplicada acima do
 * threshold; não prova que a classe TEM CSS por trás). Esta suíte cobre a
 * lacuna que sobra: lê `base-interina.css` como texto e falha se alguém
 * apagar/renomear as regras de `.alerta`/`tr.quitado` — exatamente a
 * classe de regressão que motivou este arquivo (Task 4, fix round 1): a
 * className sempre esteve certa no componente, o que sumiu foi a REGRA
 * CSS por trás dela.
 */
const css = readFileSync(
  resolve(process.cwd(), 'src/base-interina.css'),
  'utf8',
)

describe('base-interina.css — guarda de regressão (texto, não renderização)', () => {
  it('.alerta (aviso de >50% do comprometido) usa o token --destructive', () => {
    const regra = css.match(/\.alerta\s*{([^}]*)}/)
    expect(regra).not.toBeNull()
    expect(regra![1]).toMatch(/color:\s*hsl\(var\(--destructive\)\)/)
  })

  it('tr.quitado (item de dívida pago) esmaece a linha e risca o rótulo', () => {
    const linha = css.match(/tr\.quitado\s*{([^}]*)}/)
    const rotulo = css.match(/tr\.quitado td:first-child\s*{([^}]*)}/)
    expect(linha).not.toBeNull()
    expect(linha![1]).toMatch(/opacity:\s*0?\.55/)
    expect(rotulo).not.toBeNull()
    expect(rotulo![1]).toMatch(/text-decoration:\s*line-through/)
  })
})
