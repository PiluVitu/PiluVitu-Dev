'use client'

import { useSyncExternalStore } from 'react'

/** O `lg` do Tailwind: a partir dele a lista de páginas fica na coluna; abaixo, na folha. */
export const CONSULTA_DA_BANCADA_LARGA = '(min-width: 64rem)'

function consulta(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(CONSULTA_DA_BANCADA_LARGA)
    : null
}

function ouvir(avisar: () => void) {
  const lista = consulta()
  lista?.addEventListener('change', avisar)
  return () => lista?.removeEventListener('change', avisar)
}

const larga = () => consulta()?.matches ?? false

const noServidor = () => false

export function useBancadaLarga(): boolean {
  return useSyncExternalStore(ouvir, larga, noServidor)
}
