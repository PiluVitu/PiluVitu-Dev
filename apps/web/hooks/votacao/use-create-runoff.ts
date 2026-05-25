'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useCreateRunoff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: number) => votacaoApi.createRunoff(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions'] })
    },
  })
}
