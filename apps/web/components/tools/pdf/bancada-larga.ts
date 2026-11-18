'use client'

import { useSyncExternalStore } from 'react'

/** O `lg` do Tailwind: a partir dele a lista de páginas fica na coluna; abaixo, na folha. */
export const CONSULTA_DA_BANCADA_LARGA = '(min-width: 64rem)'

/** Abaixo desta altura, a folha Páginas abre com a seleção recolhida, para a lista caber. */
export const CONSULTA_DA_TELA_BAIXA = '(max-height: 49.99rem)'

function consultaDoNavegador(texto: string) {
  const consulta = (): MediaQueryList | null =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(texto)
      : null
  return {
    ouvir(avisar: () => void) {
      const lista = consulta()
      lista?.addEventListener('change', avisar)
      return () => lista?.removeEventListener('change', avisar)
    },
    vale: () => consulta()?.matches ?? false,
  }
}

const larga = consultaDoNavegador(CONSULTA_DA_BANCADA_LARGA)
const baixa = consultaDoNavegador(CONSULTA_DA_TELA_BAIXA)

const noServidor = () => false

export function useBancadaLarga(): boolean {
  return useSyncExternalStore(larga.ouvir, larga.vale, noServidor)
}

export function useTelaBaixa(): boolean {
  return useSyncExternalStore(baixa.ouvir, baixa.vale, noServidor)
}
