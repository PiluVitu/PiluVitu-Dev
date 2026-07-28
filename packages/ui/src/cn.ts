import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// SENTINELA DO GATE — não remover, não usar em app nenhum.
// `scripts/check-tailwind-source.mjs` (Task 2) procura a classe abaixo no
// CSS emitido de cada app pra confirmar que o `@source` do app enxerga
// este pacote. Ela é definida via `@utility` em styles.css e só é gerada
// se o scanner do Tailwind encontrar o literal em algum arquivo varrido —
// este comentário é esse literal. Se sumir do CSS final de um app, o
// @source dele está errado e toda classe exclusiva de packages/ui foi
// descartada silenciosamente. Ver §4 do spec.
// classe sentinela: ui-sentinela-nao-remover

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
