import { type Rng, rngPadrao, digitosAleatorios } from './aleatorio'

const PESOS = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function dvPIS(base: number[]): number {
  const soma = base.reduce((acc, d, i) => acc + d * PESOS[i], 0)
  const dv = 11 - (soma % 11)
  return dv >= 10 ? 0 : dv
}

export function gerarPIS(rng: Rng = rngPadrao): string {
  let base: number[]
  do {
    base = [1, ...digitosAleatorios(rng, 9)]
  } while (base.every((x) => x === base[0]))
  const s = [...base, dvPIS(base)].join('')
  return `${s.slice(0, 3)}.${s.slice(3, 8)}.${s.slice(8, 10)}-${s.slice(10)}`
}

export function validarPIS(valor: string): boolean {
  const s = valor.replace(/\D/g, '')
  if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false
  const nums = s.split('').map(Number)
  return dvPIS(nums.slice(0, 10)) === nums[10]
}
