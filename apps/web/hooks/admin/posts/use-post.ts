'use client'
import { useQuery } from '@tanstack/react-query'
import type { AdminPost } from '@/lib/admin/post-io'

export function usePost(slug: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'posts', slug],
    enabled,
    queryFn: async (): Promise<AdminPost> => {
      const res = await fetch(`/api/admin/posts/${slug}`)
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ??
            'Falha ao ler post',
        )
      return (await res.json()).post
    },
  })
}
