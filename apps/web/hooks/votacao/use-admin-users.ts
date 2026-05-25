'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: ['votacao', 'admin', 'users'],
    queryFn: () => votacaoApi.adminUsers(),
    enabled,
    staleTime: 30_000,
  })
}
