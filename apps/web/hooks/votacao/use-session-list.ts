'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useSessionList({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['votacao', 'sessions'],
    queryFn: () => votacaoApi.listSessions(),
    staleTime: 30_000,
    enabled,
  })
}
