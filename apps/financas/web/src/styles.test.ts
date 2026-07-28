import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * CRITICAL C1 (fix final): pin da regra que pinta o CANVAS da página —
 * sem ela, `.dark` em `<html>` troca os TOKENS mas nada aplica
 * `--background`/`--foreground` no `body`, e o resultado MEDIDO é um
 * card `bg-card` quase preto sobre um `<body>` transparente/branco (ver
 * CLAUDE.md § SPA / achado C1). CSS não roda em jsdom — igual ao extinto
 * `base-interina.test.ts` (apagado na Task 9), este teste lê o arquivo
 * como TEXTO em vez de depender de `getComputedStyle`, que não reflete
 * cascade nenhuma neste ambiente.
 *
 * Não prova o valor computado real (isso é o build real, ver o script
 * de medição usado no fix final) — prova que a REGRA continua no
 * arquivo-fonte, contra alguém apagando/reescrevendo `@layer base` sem
 * perceber que essa é a única linha que pinta o `body`.
 */
const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'styles.css')

function readStylesCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

describe('styles.css — canvas do body (fix final, achado C1)', () => {
  it('define color-scheme claro em :root e escuro em .dark', () => {
    const css = readStylesCss()

    expect(css).toMatch(/:root\s*{[^}]*color-scheme:\s*light\s*;/)
    expect(css).toMatch(/\.dark\s*{[^}]*color-scheme:\s*dark\s*;/)
  })

  it('aplica bg-background/text-foreground no body dentro de @layer base', () => {
    const css = readStylesCss()

    // Isola o bloco `body { ... }` de dentro de algum `@layer base { ... }`
    // — não casa com qualquer `body` solto fora de layer nenhum.
    const layerBaseBlocks = css.match(/@layer base\s*{[\s\S]*?\n}/g) ?? []
    const bodyRuleInsideLayerBase = layerBaseBlocks.some((block) =>
      /body\s*{[^}]*@apply[^}]*bg-background[^}]*text-foreground/.test(block),
    )

    expect(bodyRuleInsideLayerBase).toBe(true)
  })
})
