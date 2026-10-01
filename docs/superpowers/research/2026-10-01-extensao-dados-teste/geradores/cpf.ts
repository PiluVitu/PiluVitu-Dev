import { type Rng, rngPadrao, digitosAleatorios } from './aleatorio'
import { type UF, REGIAO_FISCAL_CPF } from './uf'

function calcDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0)
  const rem = sum % 11
  return rem < 2 ? 0 : 11 - rem
}

const PESOS_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]

export function gerarCPF(rng: Rng = rngPadrao, uf?: UF): string {
  let d: number[]
  do {
    d = digitosAleatorios(rng, 9)
    if (uf) d[8] = REGIAO_FISCAL_CPF[uf]
  } while (d.every((x) => x === d[0]))
  d.push(calcDigit(d, PESOS_1))
  d.push(calcDigit(d, PESOS_2))
  return `${d.slice(0, 3).join('')}.${d.slice(3, 6).join('')}.${d.slice(6, 9).join('')}-${d.slice(9).join('')}`
}

export function validarCPF(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  const nums = digits.split('').map(Number)
  const d1 = calcDigit(nums.slice(0, 9), PESOS_1)
  const d2 = calcDigit(nums.slice(0, 10), PESOS_2)
  return nums[9] === d1 && nums[10] === d2
}
