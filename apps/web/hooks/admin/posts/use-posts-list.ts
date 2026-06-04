'use client'
import { useQuery } from '@tanstack/react-query'
import type { AdminPostListItem } from '@/lib/admin/post-io'

export function usePostsList() {
  return useQuery({
    queryKey: ['admin', 'posts'],
    queryFn: async (): Promise<AdminPostListItem[]> => {
      const res = await fetch('/api/admin/posts')
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ??
            'Falha ao listar',
        )
      return (await res.json()).posts
    },
    staleTime: 15_000,
  })
}
