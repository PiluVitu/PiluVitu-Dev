import type { Rng } from './aleatorio'
import { type Prng, sfc32 } from './prng'

export const sementes = (n: number): Prng[] =>
  Array.from({ length: n }, (_, i) =>
    sfc32(i, i * 31, i * 17 + 3, 0x9e3779b9 ^ i),
  )

export const sequencia = (valores: number[]): Rng => ({
  int: () => valores.shift()!,
})

export const minimo: Rng = { int: () => 0 }
export const maximo: Rng = { int: (n) => n - 1 }
