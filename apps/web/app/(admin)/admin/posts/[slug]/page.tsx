'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { PostEditor } from '@/components/admin/posts/post-editor'
import { usePost } from '@/hooks/admin/posts/use-post'
import { usePostMutations } from '@/hooks/admin/posts/use-post-mutations'
import { extractKnownFrontmatter } from '@/lib/admin/post-schema'

export default function EditPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const router = useRouter()
  const post = usePost(slug)
  const { update } = usePostMutations()

  if (post.isLoading)
    return <Skeleton className="h-96 w-full rounded-[var(--radius)]" />
  if (post.isError || !post.data)
    return (
      <p className="text-warn p-8 text-sm">
        {(post.error as Error)?.message ?? 'Post não encontrado'}
      </p>
    )

  const fm = extractKnownFrontmatter(post.data.frontmatter)
  return (
    <PostEditor
      mode="edit"
      initialFrontmatter={{ ...fm, slug }}
      initialBody={post.data.body}
      pending={update.isPending}
      onSave={(frontmatter, body) =>
        update.mutate(
          { slug, payload: { frontmatter, body } },
          {
            onSuccess: () => {
              toast.success('Post salvo')
              router.push('/admin/posts')
            },
            onError: (e) => toast.error((e as Error).message),
          },
        )
      }
    />
  )
}
