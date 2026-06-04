'use client'
import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@/lib/admin/media-io'

export function useMediaList() {
  return useQuery({
    queryKey: ['admin', 'media'],
    queryFn: async (): Promise<MediaItem[]> => {
      const res = await fetch('/api/admin/media')
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ??
            'Falha ao listar',
        )
      return (await res.json()).items
    },
    staleTime: 15_000,
  })
}
