'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useCurrentUser() {
  return useQuery({
    queryKey: ['votacao', 'me'],
    queryFn: () => votacaoApi.me(),
    retry: false,
    staleTime: 60_000,
  })
}
