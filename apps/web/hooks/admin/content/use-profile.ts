'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProfileEntry } from '@/lib/admin/content-schemas'

const key = ['admin', 'content', 'profile']

export function useProfile() {
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<ProfileEntry> => {
      const res = await fetch('/api/admin/content/profile')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? 'Falha ao ler perfil')
      }
      return (await res.json()).data
    },
    staleTime: 15_000,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProfileEntry) =>
      fetch('/api/admin/content/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error?.message ?? 'Falha ao salvar')
        return body
      }),
    onSuccess: (body) => qc.setQueryData(key, body.data),
  })
}
