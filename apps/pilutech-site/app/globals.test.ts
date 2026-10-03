import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lerCssDoDs, tokenDoDs } from '@/lib/tokens-do-ds'

const CSS = readFileSync(join(__dirname, 'globals.css'), 'utf8')

function corDoApp(nome: string): string {
  const achado = new RegExp(`--color-${nome}:\\s*hsl\\(([^)]+)\\);`).exec(CSS)
  if (!achado) throw new Error(`--color-${nome} não está no @theme`)
  return achado[1].trim()
}

function blocoInline(): string {
  const inicio = CSS.indexOf('@theme inline {')
  if (inicio < 0) throw new Error('o globals.css não tem @theme inline')
  return CSS.slice(inicio, CSS.indexOf('}', inicio))
}

// As cores do @piluvitu/ui que dependem de uma variável (--color-x: hsl(var(--x))), com o valor.
function coresComVariavelDoDs(): [string, string][] {
  return [
    ...lerCssDoDs().matchAll(/--color-([a-z0-9-]+):\s*([^;]*var\(--[^;]+);/g),
  ].map((achado) => [achado[1], achado[2].trim()])
}

// Decisões do plano: o @theme do pacote não é inline, o Tailwind resolve a cor no :root e os
// filhos herdam a clara. Sem este bloco, o `dark` de uma seção não muda cor nenhuma, e só a cor
// computada (E2E) mostraria.
it('o @theme inline redeclara toda cor do design system que depende de variável', () => {
  const cores = coresComVariavelDoDs()
  expect(cores.map(([nome]) => nome)).toEqual(
    expect.arrayContaining([
      'background',
      'foreground',
      'primary',
      'ring',
      'ok',
    ]),
  )
  const bloco = blocoInline()
  expect(
    cores
      .filter(([nome, valor]) => !bloco.includes(`--color-${nome}: ${valor};`))
      .map(([nome]) => nome),
  ).toEqual([])
})

// Estas cores do app repetem o .dark do @piluvitu/ui: se o design system mudar a Noite, o teste avisa.
it.each([
  ['noite', 'background'],
  ['grafite', 'card'],
  ['ciano', 'primary'],
])('--color-%s é o --%s do tema escuro do @piluvitu/ui', (cor, token) => {
  expect(corDoApp(cor)).toBe(tokenDoDs('escuro', token))
})

it('importa o design system e o @source dele (o gate do build confere o efeito)', () => {
  expect(CSS).toContain("@import '@piluvitu/ui/styles.css';")
  expect(CSS).toContain("@source '../../../packages/ui/src';")
})

it('rolagem suave só para quem não pediu menos movimento', () => {
  expect(CSS).toMatch(
    /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html\s*\{\s*scroll-behavior: smooth;/,
  )
})
