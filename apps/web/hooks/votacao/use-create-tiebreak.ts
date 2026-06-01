'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useCreateTiebreak(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entropy: string) => votacaoApi.tiebreak(sessionId, entropy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions', sessionId] })
      qc.invalidateQueries({
        queryKey: ['votacao', 'sessions', sessionId, 'results'],
      })
    },
  })
}
