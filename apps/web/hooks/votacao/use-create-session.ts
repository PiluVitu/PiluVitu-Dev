'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'
import type { CreateSessionBody } from '@/lib/votacao/types'

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSessionBody) => votacaoApi.createSession(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions'] })
    },
  })
}
