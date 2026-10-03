import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Tema = 'claro' | 'escuro'

export function lerCssDoDs(): string {
  return readFileSync(
    join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'styles.css'),
    'utf8',
  )
}

export function tokenDoDs(
  tema: Tema,
  nome: string,
  css: string = lerCssDoDs(),
): string {
  const seletor = tema === 'claro' ? ':root {' : '.dark {'
  const inicio = css.indexOf(seletor)
  const bloco = inicio < 0 ? '' : css.slice(inicio, css.indexOf('}', inicio))
  const achado = new RegExp(`--${nome}:\\s*([^;]+);`).exec(bloco)
  if (!achado)
    throw new Error(`--${nome} não está no bloco ${seletor} do @piluvitu/ui`)
  return achado[1].trim()
}

export function hslParaHex(triplo: string): string {
  const [h, s, l] = triplo.replace(/%/g, '').trim().split(/\s+/).map(Number)
  const sat = s / 100
  const luz = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(luz, 1 - luz)
  const canal = (n: number) =>
    luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[0, 8, 4]
    .map((n) =>
      Math.round(canal(n) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

export function rgbDoToken(tema: Tema, nome: string, css?: string): string {
  const hex = hslParaHex(tokenDoDs(tema, nome, css))
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}
