import { type Rng, rngPadrao, digitosAleatorios } from './aleatorio'

// RG não tem padrão nacional: este é o modelo SSP-SP (8 dígitos + DV).
export function dvRGSP(base: number[]): string {
  const soma = base.reduce((acc, d, i) => acc + d * (i + 2), 0)
  const dv = 11 - (soma % 11)
  if (dv === 10) return 'X'
  if (dv === 11) return '0'
  return String(dv)
}

export function formatarRG(base: number[], dv: string): string {
  const s = base.join('')
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}-${dv}`
}

export function gerarRG(
  rng: Rng = rngPadrao,
  { permitirX = false }: { permitirX?: boolean } = {},
): string {
  for (;;) {
    const base = digitosAleatorios(rng, 8)
    if (base.every((x) => x === base[0])) continue
    const dv = dvRGSP(base)
    if (dv === 'X' && !permitirX) continue
    return formatarRG(base, dv)
  }
}

export function validarRG(valor: string): boolean {
  const s = valor.toUpperCase().replace(/[.\-\s]/g, '')
  if (!/^\d{8}[\dX]$/.test(s)) return false
  const base = s.slice(0, 8).split('').map(Number)
  if (base.every((x) => x === base[0])) return false
  return dvRGSP(base) === s[8]
}
