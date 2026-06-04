'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { usePostsList } from '@/hooks/admin/posts/use-posts-list'
import { usePostMutations } from '@/hooks/admin/posts/use-post-mutations'
import { PostsTable } from '@/components/admin/posts/posts-table'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'

export default function PostsPage() {
  const list = usePostsList()
  const { remove } = usePostMutations()
  const [deleting, setDeleting] = useState<string | null>(null)
  const posts = list.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Posts" count={posts.length} />
        <Button asChild>
          <Link href="/admin/posts/novo">+ Novo post</Link>
        </Button>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <PostsTable posts={posts} onDelete={(slug) => setDeleting(slug)} />
      )}

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        itemLabel={
          posts.find((p) => p.slug === deleting)?.title ?? deleting ?? ''
        }
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting, {
            onSuccess: () => {
              toast.success('Removido')
              setDeleting(null)
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }}
      />
    </div>
  )
}
