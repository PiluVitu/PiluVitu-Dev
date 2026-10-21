import type { CreateSessionBody, VotingSession } from './types'

export const HALLOWEEN_CATEGORIES = ['terror', 'suspense']
export const HALLOWEEN_PER_CATEGORY = 4
export const MAX_PER_CATEGORY = 5

const TITULO_DE_HALLOWEEN = /halloween|🎃/i

export function isHalloweenSession(
  session: Pick<VotingSession, 'Title' | 'SortOptionsJSON'>,
): boolean {
  if (TITULO_DE_HALLOWEEN.test(session.Title)) return true
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
}): CreateSessionBody {
  return {
    title: input.title,
    types: ['filme'],
    include_watched: input.includeWatched,
    categories: HALLOWEEN_CATEGORIES,
    per_category: Math.min(Math.max(1, input.perCategory), MAX_PER_CATEGORY),
    theme: 'halloween',
  }
}
