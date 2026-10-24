/**
 * O prompt do insight é o `build_prompt` de `apps/promeia/src/promeia/insight.py`
 * portado byte a byte. Cada `.txt` em `__fixtures__/` foi gerado rodando o
 * Python sobre o `.json` de mesmo nome, ANTES do porte existir:
 *
 *   cd apps/promeia && uv run python -I <script> <caminho>/insight-prompt-*.json
 *
 * onde o script faz `open(saida, "w").write(build_prompt(json.load(entrada)))`.
 * A comparação é por `===`: qualquer espaço, acento ou quebra de linha diferente
 * reprova.
 */
import { describe, expect, it } from 'vitest'
import mesNormalJson from './__fixtures__/insight-prompt-mes-normal.json?raw'
import mesNormalTxt from './__fixtures__/insight-prompt-mes-normal.txt?raw'
import semBaseJson from './__fixtures__/insight-prompt-sem-base.json?raw'
import semBaseTxt from './__fixtures__/insight-prompt-sem-base.txt?raw'
import semGastoJson from './__fixtures__/insight-prompt-sem-gasto.json?raw'
import semGastoTxt from './__fixtures__/insight-prompt-sem-gasto.txt?raw'
import { montarPromptInsight } from './insight-prompt'
import type { InsightNumbers } from './insights'

const casos: Array<[string, string, string]> = [
  ['mês normal', mesNormalJson, mesNormalTxt],
  ['sem base de comparação', semBaseJson, semBaseTxt],
  ['sem gasto', semGastoJson, semGastoTxt],
]

describe('montarPromptInsight', () => {
  it.each(casos)(
    '%s: idêntico ao build_prompt do Python',
    (_, entrada, esperado) => {
      const numbers = JSON.parse(entrada) as InsightNumbers
      const prompt = montarPromptInsight(numbers)
      expect(prompt === esperado).toBe(true)
      expect(prompt).toBe(esperado)
    },
  )

  it('as fixtures cobrem os três ramos da linha de variação e do maior crescimento', () => {
    expect(mesNormalTxt).toContain('Variação: Aumento de R$ 397,60 (10%)')
    expect(semBaseTxt).toContain('Variação: Sem base de comparação')
    expect(semGastoTxt).toContain('Variação: Redução de R$ 4.197,60 (100%)')
    expect(semGastoTxt).toContain('(nenhum gasto registrado nesta competência)')
    expect(semGastoTxt).toContain('(sem dado suficiente para apontar)')
  })

  it('sem variação usa a frase própria do Python', () => {
    const numbers = JSON.parse(mesNormalJson) as InsightNumbers
    const prompt = montarPromptInsight({
      ...numbers,
      variation_cents: 0,
      variation_pct: 0,
    })
    expect(prompt).toContain('Variação: Sem variação em relação a 2026-08.\n')
  })
})
