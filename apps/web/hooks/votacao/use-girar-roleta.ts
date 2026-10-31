'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useGirarRoleta(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entropy: string) => votacaoApi.girarRoleta(sessionId, entropy),
    // O prefixo cobre a lista e o detalhe da sessão.
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions'] }),
  })
}
