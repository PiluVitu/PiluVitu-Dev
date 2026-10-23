import type { CreateSessionBody, VotingSession } from './types'

function sortOptions(
  session: Pick<VotingSession, 'SortOptionsJSON'>,
): { theme?: unknown; mode?: unknown } | null {
  try {
    return JSON.parse(session.SortOptionsJSON) as {
      theme?: unknown
      mode?: unknown
    } | null
  } catch {
    return null
  }
}

export function isHalloweenSession(
  session: Pick<VotingSession, 'SortOptionsJSON'>,
): boolean {
  return sortOptions(session)?.theme === 'halloween'
}

/**
 * Sessão que é uma roleta de um filme só, em vez de votação. O ramielle grava
 * `mode: 'roleta'` nas sessões de Halloween criadas a partir de 2026-10-23; as
 * de antes continuam sendo votação com o tema.
 */
export function isRoletaSession(
  session: Pick<VotingSession, 'SortOptionsJSON'>,
): boolean {
  return sortOptions(session)?.mode === 'roleta'
}

/**
 * Corpo da sessão de Halloween: o ramielle sorteia entre os filmes com a
 * coluna "Halloween" marcada na planilha, então categoria não vai.
 */
export function halloweenSessionBody(input: {
  title: string
  includeWatched: boolean
}): CreateSessionBody {
  return {
    title: input.title,
    types: ['filme'],
    include_watched: input.includeWatched,
    categories: [],
    theme: 'halloween',
  }
}
