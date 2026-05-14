const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

function calcDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0)
  const rem = sum % 11
  return rem < 2 ? 0 : 11 - rem
}

export function gerarCNPJ(): string {
  const base = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10))
  const branch = [0, 0, 0, 1]
  const all = [...base, ...branch]
  all.push(calcDigit(all, WEIGHTS_1))
  all.push(calcDigit(all, WEIGHTS_2))
  const s = all.join('')
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`
}

export function validarCNPJ(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false
  const nums = digits.split('').map(Number)
  const d1 = calcDigit(nums.slice(0, 12), WEIGHTS_1)
  const d2 = calcDigit(nums.slice(0, 13), WEIGHTS_2)
  return nums[12] === d1 && nums[13] === d2
}
