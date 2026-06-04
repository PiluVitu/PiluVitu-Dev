'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PostEditor } from '@/components/admin/posts/post-editor'
import { usePostMutations } from '@/hooks/admin/posts/use-post-mutations'
import type { PostFrontmatter } from '@/lib/admin/post-schema'

const EMPTY_FM: PostFrontmatter = {
  title: '',
  slug: '',
  excerpt: '',
  coverImage: '',
  tags: [],
  publishedAt: '',
  draft: true,
}

export default function NovoPostPage() {
  const router = useRouter()
  const { create } = usePostMutations()
  return (
    <PostEditor
      mode="create"
      initialFrontmatter={EMPTY_FM}
      initialBody={'# Novo post\n\n'}
      pending={create.isPending}
      onSave={(frontmatter, body) =>
        create.mutate(
          { frontmatter, body },
          {
            onSuccess: () => {
              toast.success('Post criado')
              router.push('/admin/posts')
            },
            onError: (e) => toast.error((e as Error).message),
          },
        )
      }
    />
  )
}
