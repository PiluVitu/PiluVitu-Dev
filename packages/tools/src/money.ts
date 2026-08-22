/**
 * Dinheiro em centavos. NUNCA float: `0.1 + 0.2` acumula erro de centavo, e o
 * schema do D1 guarda tudo como INTEGER (invariante 1 do spec).
 */
export type Cents = number

// Aceita: '1.360,00' | '1360,00' | '1360' | 'R$ 1.360,00' (e as variantes com
// sinal negativo antes do 'R$'). O grupo do inteiro exige separador de milhar
// consistente: '1.36' e '12.3456' são recusados de propósito.
const BRL = /^(-)?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/

export function parseBRL(input: string): Cents {
  const match = BRL.exec(String(input).trim())
  if (match === null) {
    throw new RangeError(`valor monetário inválido: ${JSON.stringify(input)}`)
  }
  const [, sign, intPart, decPart = ''] = match
  const cents = Number(intPart.replace(/\./g, '') + decPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(
      `valor monetário fora do alcance seguro: ${JSON.stringify(input)}`,
    )
  }
  if (cents === 0) return 0
  return sign === '-' ? -cents : cents
}

// Formatação manual em vez de Intl.NumberFormat: o Intl usa U+00A0 entre 'R$'
// e o número e o resultado varia com a versão do ICU do runtime (Node, jsdom,
// workerd). Aqui a saída é byte a byte a mesma em qualquer lugar.
export function formatBRL(cents: Cents): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(
      `centavos precisam ser inteiro seguro: ${String(cents)}`,
    )
  }
  const abs = Math.abs(cents)
  const inteiro = String(Math.trunc(abs / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    '.',
  )
  const decimal = String(abs % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}R$ ${inteiro},${decimal}`
}

/**
 * `R$ 21.123` — sem os centavos. Existe por uma medida, não por gosto:
 * MEDIDO em Chrome real a 390×844, `R$ 21.122,50` a 24px pede **155,5px** e a
 * caixa útil de um card num grid de 2 colunas é **137px** — a linha quebra em
 * duas. Sem os centavos o mesmo valor mede **118,8px** e cabe numa linha só. Ver `apps/financas/web/src/blocos/NumeroCard.tsx`, que amarra "grid de
 * 2 colunas" a "sem centavos" num prop só, pra não existir a combinação que
 * estoura.
 *
 * Mora AQUI, ao lado de `formatBRL`, e não num `lib/` da SPA: dinheiro tem UM
 * formatador neste monorepo. Uma segunda função de formatar dinheiro fora
 * deste módulo é uma segunda separação de milhar, um segundo `R$ `, um segundo
 * tratamento de sinal — e é a classe de cópia que já custou caro aqui
 * (`todayInTeresina`, `normalizeName`). O Worker (`apps/financas/src`) já
 * importa `@piluvitu/tools/money` e não alcança `web/src/lib`: local, esta
 * função nasceria inalcançável pra ele.
 *
 * ⚠️ **ARREDONDA (não trunca), e arredonda a MAGNITUDE.**
 *
 * Truncar erraria até 99 centavos por valor; arredondar erra no máximo 50 —
 * metade. Isso importa porque nada torna a operação aditiva: uma coluna de
 * partes sem centavos **não** soma exatamente o total sem centavos, e o que dá
 * pra escolher é só o TAMANHO do desencontro. Com arredondamento o erro por
 * parcela é ≤ 50 centavos e os erros se cancelam (uns pra cima, outros pra
 * baixo); com truncamento todo erro vai pro mesmo lado e se acumula, então uma
 * lista de 8 contas pode divergir R$ 8 do total — visível, e sempre no mesmo
 * sentido (o total parecendo maior que a soma do que está na tela).
 *
 * É também o arredondamento que este módulo já usa em todo lugar
 * (`pct_of_fixed_net` em `domain/reports.ts`, o float→centavos de
 * `domain/pluggy-map.ts`) — um segundo critério de arredondamento seria mais
 * uma coisa a divergir.
 *
 * ⚠️ **`Math.round` na magnitude, nunca no valor com sinal**: `Math.round(-0.5)`
 * é `-0` e `Math.round(0.5)` é `1`, então arredondar com sinal faria meio real
 * cair pra lados diferentes conforme a direção. Mesma lição já paga em
 * `apps/financas/src/domain/pluggy-map.ts`.
 *
 * ⚠️ **Nunca use isto num card de largura total** — lá cabem os centavos, e
 * esconder centavo que cabe é perder precisão de graça.
 */
export function formatBRLSemCentavos(cents: Cents): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(
      `centavos precisam ser inteiro seguro: ${String(cents)}`,
    )
  }
  const reais = Math.round(Math.abs(cents) / 100)
  const inteiro = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  // `-0` nunca chega à tela: 49 centavos negativos viram `R$ 0`, não `-R$ 0`.
  const sinal = cents < 0 && reais !== 0 ? '-' : ''
  return `${sinal}R$ ${inteiro}`
}

// O resto de (total % count) vai nas PRIMEIRAS parcelas — é o que os emissores
// brasileiros fazem. R$ 100,00 em 3x = 3334 + 3333 + 3333.
export function splitInstallments(total: Cents, count: number): Cents[] {
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new RangeError(
      `total precisa ser inteiro positivo em centavos: ${String(total)}`,
    )
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > 360) {
    throw new RangeError(
      `número de parcelas precisa estar entre 1 e 360: ${String(count)}`,
    )
  }
  const base = Math.floor(total / count)
  const resto = total - base * count
  return Array.from({ length: count }, (_, i) => (i < resto ? base + 1 : base))
}

export function sumCents(values: Cents[]): Cents {
  let total = 0
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(
        `centavos precisam ser inteiro seguro: ${String(value)}`,
      )
    }
    total += value
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('soma de centavos estourou o inteiro seguro')
  }
  return total
}
