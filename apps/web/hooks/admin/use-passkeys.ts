'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deletePasskey,
  listPasskeys,
  registerPasskey,
} from '@/lib/admin/passkey'

const CHAVE = ['admin', 'passkeys'] as const

export function usePasskeys() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: listPasskeys,
    retry: false,
  })
}

export function usePasskeyMutations() {
  const queryClient = useQueryClient()
  const recarregar = () => queryClient.invalidateQueries({ queryKey: CHAVE })

  const cadastrar = useMutation({
    mutationFn: (nome: string) => registerPasskey(nome),
    onSuccess: recarregar,
  })
  const remover = useMutation({
    mutationFn: (id: string) => deletePasskey(id),
    onSuccess: recarregar,
  })
  return { cadastrar, remover }
}
