import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⚠️ Gate de TEXTO, no espírito de `src/styles.test.ts`: jsdom não computa
 * CSS, e um teste por tela só provaria a tela que alguém lembrou de escrever.
 *
 * A regra: **todo `<th>` de cabeçalho de COLUNA usa `ROTULO`**
 * (`lib/tipografia.ts`) — o versalete mono do `/admin`. Antes eram
 * `text-left font-medium`, indistinguíveis do corpo da tabela: o rótulo do
 * número tinha o mesmo peso do número.
 *
 * ⚠️ O `<th>` de `<tfoot>` fica DE FORA de propósito — lá ele não é
 * cabeçalho de coluna, é o rótulo da LINHA de total ("TOTAL", "TOTAL PJ"),
 * colado a um valor no mesmo `text-sm`; encolhê-lo pra 12px mono
 * desalinharia a linha inteira que ele nomeia.
 */
const PAGES = join(__dirname)

function forDeFooter(src: string): string {
  // Remove os blocos <tfoot>…</tfoot> antes de procurar <th>.
  return src.replace(/<tfoot[\s\S]*?<\/tfoot>/g, '')
}

describe('todo cabeçalho de coluna fala a mesma língua', () => {
  const arquivos = readdirSync(PAGES).filter(
    (f) => f.endsWith('.tsx') && !f.includes('.test.'),
  )

  it('encontra os arquivos de tela (o gate não passa por vacuidade)', () => {
    expect(arquivos.length).toBeGreaterThan(5)
  })

  for (const arquivo of arquivos) {
    const src = readFileSync(join(PAGES, arquivo), 'utf8')
    if (!src.includes('<th')) continue

    it(`${arquivo}: todo <th> fora de <tfoot> usa ROTULO`, () => {
      const corpo = forDeFooter(src)
      const semRotulo: string[] = []
      for (const m of corpo.matchAll(/<th\b/g)) {
        const trecho = corpo.slice(m.index, m.index + 220)
        if (!trecho.includes('ROTULO')) semRotulo.push(trecho.slice(0, 90))
      }
      expect(semRotulo).toEqual([])
    })
  }
})
