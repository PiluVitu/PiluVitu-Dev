'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useSessionDetail(id: number) {
  return useQuery({
    queryKey: ['votacao', 'sessions', id],
    queryFn: () => votacaoApi.getSession(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

export function useResults(id: number, enabled = true) {
  return useQuery({
    queryKey: ['votacao', 'sessions', id, 'results'],
    queryFn: () => votacaoApi.results(id),
    enabled: enabled && id > 0,
  })
}
