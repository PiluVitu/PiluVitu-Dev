/**
 * @jest-environment node
 */
import { dirname, join } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

// Compila o CSS do design system com o Tailwind de verdade. Os componentes de
// `@piluvitu/ui` (dialog, sheet, dropdown-menu, ajuda) usam `animate-in`,
// `fade-in-0`, `zoom-in-95` e `slide-in-from-*`, que vinham do plugin
// tw-animate — nunca instalado. Sem as regras, o build emitia zero CSS para
// essas classes e tudo abria e fechava seco. Ler o arquivo como texto não
// pegaria isso; só a compilação mostra se a classe vira CSS.
const DE = join(__dirname, 'movimento.css')

const CLASSES = [
  'data-[state=open]:animate-in',
  'data-[state=closed]:animate-out',
  'data-[state=open]:fade-in-0',
  'data-[state=closed]:fade-out-0',
  'data-[state=open]:zoom-in-95',
  'data-[state=closed]:zoom-out-95',
  'data-[state=open]:slide-in-from-right',
  'data-[state=closed]:slide-out-to-right',
  'data-[state=open]:slide-in-from-left',
  'data-[state=open]:slide-in-from-top',
  'data-[state=open]:slide-in-from-bottom',
  'data-[state=closed]:slide-out-to-left',
  'data-[state=closed]:slide-out-to-top',
  'data-[state=closed]:slide-out-to-bottom',
]

async function compilar(): Promise<string> {
  const entrada = [
    "@import 'tailwindcss' source(none);",
    "@import '@piluvitu/ui/styles.css';",
    `@source inline(${JSON.stringify(CLASSES.join(' '))});`,
  ].join('\n')
  const r = await postcss([tailwind({ base: dirname(DE) })]).process(entrada, {
    from: DE,
  })
  return r.css
}

function bloco(css: string, nome: string): string {
  const inicio = css.indexOf(`@keyframes ${nome}`)
  if (inicio === -1) return ''
  let nivel = 0
  for (let i = css.indexOf('{', inicio); i < css.length; i++) {
    if (css[i] === '{') nivel++
    if (css[i] === '}' && --nivel === 0) return css.slice(inicio, i + 1)
  }
  return ''
}

describe('movimento do design system', () => {
  let css = ''
  beforeAll(async () => {
    css = await compilar()
  }, 30_000)

  it.each(CLASSES)('a classe %s vira CSS', (classe) => {
    const seletor = classe.replace(/[[\]=:]/g, (c) => `\\${c}`)
    expect(css).toContain(`.${seletor}`)
  })

  it('entrada e saída usam só opacity e transform', () => {
    for (const nome of ['ui-entrar', 'ui-sair']) {
      const kf = bloco(css, nome)
      expect(kf).not.toBe('')
      const propriedades = [...kf.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(new Set(propriedades)).toEqual(new Set(['opacity', 'transform']))
    }
  })

  it('a duração padrão fica entre 150 e 300 ms', () => {
    const duracoes = [...css.matchAll(/--tw-duration,\s*(\d+)ms/g)].map((m) =>
      Number(m[1]),
    )
    expect(duracoes.length).toBeGreaterThan(0)
    for (const d of duracoes) {
      expect(d).toBeGreaterThanOrEqual(150)
      expect(d).toBeLessThanOrEqual(300)
    }
  })

  // reduced-motion: some o deslocamento e a escala; fica só um fade curto.
  it('prefers-reduced-motion troca para keyframes só de opacidade', () => {
    const reduzido = css.match(
      /@media \(prefers-reduced-motion: reduce\)\s*{[^}]*animation-name:\s*ui-(entrar|sair)-reduzido/g,
    )
    expect(reduzido?.length).toBeGreaterThanOrEqual(2)
    for (const nome of ['ui-entrar-reduzido', 'ui-sair-reduzido']) {
      const kf = bloco(css, nome)
      expect(kf).toContain('opacity')
      expect(kf).not.toContain('transform')
    }
  })
})
