import { escrever, preenchivel, type Campo } from './dom'

export interface Escrito {
  el: Campo
  valor: string
  lido: string
}

export const SEGUNDA_PASSADA_MS = 1000

export function regravarAlterados(escritos: readonly Escrito[]): void {
  for (const { el, valor, lido } of escritos) {
    if (el.isConnected && preenchivel(el) && el.value !== lido)
      escrever(el, valor)
  }
}

export function agendarSegundaPassada(
  escritos: readonly Escrito[],
  agendar: (acao: () => void, ms: number) => void,
): void {
  if (escritos.length > 0)
    agendar(() => regravarAlterados(escritos), SEGUNDA_PASSADA_MS)
}
