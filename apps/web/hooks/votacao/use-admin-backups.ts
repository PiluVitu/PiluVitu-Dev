'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useAdminBackups(enabled = true) {
  return useQuery({
    queryKey: ['votacao', 'admin', 'backups'],
    queryFn: () => votacaoApi.adminBackups(),
    enabled,
    staleTime: 30_000,
  })
}

export function useCreateBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => votacaoApi.adminCreateBackup(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'admin', 'backups'] })
    },
  })
}
