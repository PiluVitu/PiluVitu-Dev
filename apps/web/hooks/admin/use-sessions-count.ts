'use client'

import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useSessionsCount() {
  return useQuery({
    queryKey: ['admin', 'sessions-count'],
    queryFn: async () => {
      const r = await votacaoApi.listSessions()
      const sessions = r.sessions ?? []
      return {
        total: sessions.length,
        open: sessions.filter((s) => s.Status === 'open').length,
        closed: sessions.filter((s) => s.Status === 'closed').length,
      }
    },
    staleTime: 30_000,
  })
}
