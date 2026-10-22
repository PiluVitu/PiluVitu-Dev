'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useCategories(enabled = true) {
  return useQuery({
    queryKey: ['votacao', 'categorias'],
    queryFn: () => votacaoApi.categories(),
    enabled,
    staleTime: 60_000,
  })
}
