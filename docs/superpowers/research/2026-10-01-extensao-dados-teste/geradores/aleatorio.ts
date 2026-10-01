import type { Prng } from './prng'

export type Rng = Pick<Prng, 'int'>

export const rngPadrao: Rng = {
  int: (maxExclusive) => Math.floor(Math.random() * maxExclusive),
}

export function escolher<T>(rng: Rng, itens: readonly T[]): T {
  return itens[rng.int(itens.length)]
}

export function embaralhar<T>(rng: Rng, itens: readonly T[]): T[] {
  const out = itens.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function digitosAleatorios(rng: Rng, quantidade: number): number[] {
  return Array.from({ length: quantidade }, () => rng.int(10))
}

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}
