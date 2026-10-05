export const NOME_DA_MARCA = 'PiluTech'

export const BLOCOS_DA_MARCA = [
  { x: 8.5, y: 0, destaque: false },
  { x: 25.5, y: 0, destaque: true },
  { x: 8.5, y: 17, destaque: false },
  { x: 25.5, y: 17, destaque: false },
  { x: 8.5, y: 34, destaque: false },
] as const

export const LADO_DO_BLOCO = 14
export const RAIO_DO_BLOCO = 3.5

export const CORES_DA_MARCA = {
  noite: '#090b11',
  texto: '#e7ecf3',
  ciano: '#3abff8',
  aco: '#94a0b3',
} as const

export const LADO_DO_ICONE = 192
export const LADO_DO_APPLE_ICON = 180
export const LADOS_DO_FAVICON = [16, 32, 48] as const

export function proporcoesDoLockup(tamanho: number): {
  espaco: number
  palavra: number
} {
  return {
    espaco: Math.round(tamanho * 0.28),
    palavra: Math.round(tamanho * 0.6),
  }
}
