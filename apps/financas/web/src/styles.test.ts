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

  it('html trava scroll-padding-bottom pela ALTURA REAL da tab bar fixa', () => {
    // ⚠️ Achado da revisão: esta era a correção-manchete de a11y da fatia da
    // casca — e não tinha gate NENHUM. Apagando a regra inteira, a suíte
    // ficava 621/621 verde, e um formatador ou refactor a levaria embora sem
    // ninguém notar.
    //
    // O que ela protege, MEDIDO em Chrome real: `scrollIntoView({block:
    // 'nearest'})` — o conserto que trouxe a recusa do servidor pra vista no
    // `#/extrato` — dá a rolagem por concluída mirando a viewport CRUA. Com
    // `0px`, a sonda para em `bottom 844` contra topo de barra em `787`: a
    // mensagem nasce ATRÁS da tab bar fixa.
    //
    // ⚠️ Os três termos são aferidos separados porque cada um tem uma razão:
    //   3.5rem  = h-14, a altura da tab bar
    //   1px     = o `border-t` dela. Com `3.5rem` puro a sonda parava em 788,
    //             coberta por UM pixel — medido, não teórico.
    //   env()   = a safe-area do iPhone, que a barra também soma no padding.
    // ⚠️ Comentário FORA primeiro. A 1ª versão deste teste fazia
    // `indexOf('scroll-padding-bottom')` no CSS cru — e o termo aparece DUAS
    // vezes: no comentário que explica a regra, e na regra. O `indexOf`
    // achava o comentário, que sobrevive a apagar a regra, então as três
    // mutações (apagar tudo, tirar o `1px`, tirar o `env()`) passavam VERDES.
    // Era teste decorativo, o mesmo defeito que ele existe pra impedir.
    const semComentarios = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')

    const i = semComentarios.indexOf('scroll-padding-bottom')
    expect(i, 'a regra html { scroll-padding-bottom } sumiu').toBeGreaterThan(
      -1,
    )
    const declaracao = semComentarios.slice(i, semComentarios.indexOf('}', i))

    expect(declaracao).toContain('3.5rem') // a altura da barra
    expect(declaracao).toContain('1px') // a borda — o pixel que cobria a mensagem
    expect(declaracao).toContain('env(safe-area-inset-bottom') // a safe-area
  })
})
