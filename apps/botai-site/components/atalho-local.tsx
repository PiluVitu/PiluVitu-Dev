'use client'

import { useSyncExternalStore } from 'react'
import {
  atalhoDoVisitante,
  ehFirefox,
  sistemaDoVisitante,
  VISITANTE_DO_SERVIDOR,
} from '@/lib/visitante'

const semInscricao = () => () => {}

export function AtalhoLocal() {
  const sistema = useSyncExternalStore(
    semInscricao,
    () => sistemaDoVisitante(navigator),
    () => VISITANTE_DO_SERVIDOR.sistema,
  )
  const firefox = useSyncExternalStore(
    semInscricao,
    () => ehFirefox(navigator),
    () => VISITANTE_DO_SERVIDOR.firefox,
  )
  const { tecla, nomeDoSistema } = atalhoDoVisitante(sistema, firefox)
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="border-border bg-muted text-foreground rounded-[6px] border px-1.5 py-0.5 font-mono text-xs">
        {tecla}
      </kbd>{' '}
      preenche a página no {nomeDoSistema}
    </span>
  )
}
