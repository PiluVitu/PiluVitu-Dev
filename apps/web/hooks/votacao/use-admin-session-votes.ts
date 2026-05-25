'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useAdminSessionVotes(id: number, enabled = true) {
  return useQuery({
    queryKey: ['votacao', 'admin', 'sessions', id, 'votes'],
    queryFn: () => votacaoApi.adminSessionVotes(id),
    enabled: enabled && id > 0,
    staleTime: 15_000,
  })
}
