'use client'
import { useSyncExternalStore } from 'react'
import { baseDaVotacao, PREFIXO_INTERNO } from '@/lib/votai'

const semAssinatura = () => () => {}

/**
 * Base dos links da votação: '' no host do Votaí, '/votacao' no site e no preview. O servidor não
 * sabe o host (a página é estática, e ler o pedido a tornaria dinâmica), então o HTML sai com
 * '/votacao' e a hidratação troca pelo valor do navegador sem acusar diferença.
 */
export function useBaseDaVotacao(): string {
  return useSyncExternalStore(
    semAssinatura,
    () => baseDaVotacao(window.location.hostname),
    () => PREFIXO_INTERNO,
  )
}
