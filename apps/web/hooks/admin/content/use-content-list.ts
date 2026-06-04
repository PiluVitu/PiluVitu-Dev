'use client'

import { useQuery } from '@tanstack/react-query'
import type { CollectionKey } from '@/lib/admin/content-registry'

export interface ListedEntry<T = Record<string, unknown>> {
  slug: string
  data: T
}

export function useContentList<T = Record<string, unknown>>(
  collection: CollectionKey,
) {
  return useQuery({
    queryKey: ['admin', 'content', collection],
    queryFn: async (): Promise<ListedEntry<T>[]> => {
      const res = await fetch(`/api/admin/content/${collection}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? 'Falha ao listar')
      }
      return (await res.json()).entries
    },
    staleTime: 15_000,
  })
}
