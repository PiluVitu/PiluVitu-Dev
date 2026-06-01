'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useVoteMutation(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (movieIds: number[]) => votacaoApi.vote(sessionId, movieIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions', sessionId] })
      qc.invalidateQueries({
        queryKey: ['votacao', 'sessions', sessionId, 'results'],
      })
    },
  })
}
