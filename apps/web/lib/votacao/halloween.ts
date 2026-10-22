import type { CreateSessionBody, VotingSession } from './types'

/** Categorias marcadas por padrão; o admin pode trocar no formulário. */
export const HALLOWEEN_CATEGORIES = ['terror']
export const HALLOWEEN_PER_CATEGORY = 8
export const MAX_PER_CATEGORY = 10

export function isHalloweenSession(
  session: Pick<VotingSession, 'SortOptionsJSON'>,
): boolean {
  try {
    const opts = JSON.parse(session.SortOptionsJSON) as { theme?: unknown }
    return opts?.theme === 'halloween'
  } catch {
    return false
  }
}

export function halloweenSessionBody(input: {
  title: string
  includeWatched: boolean
  perCategory: number
  categories?: string[]
}): CreateSessionBody {
  return {
    title: input.title,
    types: ['filme'],
    include_watched: input.includeWatched,
    categories: input.categories ?? HALLOWEEN_CATEGORIES,
    per_category: Math.min(Math.max(1, input.perCategory), MAX_PER_CATEGORY),
    theme: 'halloween',
  }
}

/**
 * Opções do formulário: as categorias da planilha mais as padrão de
 * Halloween, que aparecem mesmo antes de existirem na planilha.
 */
export function categoriasDisponiveis(daPlanilha: string[] = []): string[] {
  return [...new Set([...HALLOWEEN_CATEGORIES, ...daPlanilha])]
}
