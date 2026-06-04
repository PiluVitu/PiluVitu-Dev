'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PostFrontmatter } from '@/lib/admin/post-schema'

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? 'Falha na operação')
  return body
}

export interface PostPayload {
  frontmatter: PostFrontmatter
  body: string
}

export function usePostMutations() {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['admin', 'posts'] })

  const create = useMutation({
    mutationFn: (p: PostPayload) =>
      fetch('/api/admin/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      }).then(jsonOrThrow),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: PostPayload }) =>
      fetch(`/api/admin/posts/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(jsonOrThrow),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/admin/posts/${slug}`, { method: 'DELETE' }).then(jsonOrThrow),
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
