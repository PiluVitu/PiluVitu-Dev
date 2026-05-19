'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useCloseSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => votacaoApi.closeSession(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions'] })
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions', id] })
    },
  })
}
