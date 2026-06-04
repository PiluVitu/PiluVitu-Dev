'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CollectionKey } from '@/lib/admin/content-registry'
import type { ListedEntry } from './use-content-list'

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? 'Falha na operação')
  return body
}

export function useContentMutations(collection: CollectionKey) {
  const qc = useQueryClient()
  const key = ['admin', 'content', collection]

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/admin/content/${collection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const update = useMutation({
    mutationFn: ({
      slug,
      data,
    }: {
      slug: string
      data: Record<string, unknown>
    }) =>
      fetch(`/api/admin/content/${collection}/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/admin/content/${collection}/${slug}`, {
        method: 'DELETE',
      }).then(jsonOrThrow),
    onMutate: async (slug) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ListedEntry[]>(key)
      qc.setQueryData<ListedEntry[]>(key, (old) =>
        (old ?? []).filter((e) => e.slug !== slug),
      )
      return { prev }
    },
    onError: (_e, _slug, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const reorder = useMutation({
    mutationFn: (slugs: string[]) =>
      fetch(`/api/admin/content/${collection}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs }),
      }).then(jsonOrThrow),
    onMutate: async (slugs) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ListedEntry[]>(key)
      qc.setQueryData<ListedEntry[]>(key, (old) => {
        const bySlug = new Map((old ?? []).map((e) => [e.slug, e]))
        return slugs.map((s) => bySlug.get(s)).filter(Boolean) as ListedEntry[]
      })
      return { prev }
    },
    onError: (_e, _slugs, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  return { create, update, remove, reorder }
}
