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
