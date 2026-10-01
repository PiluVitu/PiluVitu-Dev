import type { Campo } from './dom'

export interface Registro {
  guardar(el: Campo): number
  buscar(idx: number): Campo | undefined
}

export function criarRegistro(): Registro {
  const referencias = new Map<number, WeakRef<Campo>>()
  let sequencia = 0
  return {
    guardar(el) {
      sequencia += 1
      referencias.set(sequencia, new WeakRef(el))
      return sequencia
    },
    buscar(idx) {
      const el = referencias.get(idx)?.deref()
      return el?.isConnected ? el : undefined
    },
  }
}
