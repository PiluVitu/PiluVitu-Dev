'use client'

import { MDXRemote } from 'next-mdx-remote'
import { mdxComponents } from '@/lib/mdx/mdx-components'
import { useMdxPreview } from '@/hooks/admin/posts/use-mdx-preview'

export function MdxPreview(props: { mdx: string }) {
  const { serialized, error, loading } = useMdxPreview(props.mdx)
  return (
    <div className="border-border h-full overflow-y-auto rounded-lg border p-5">
      {error ? (
        <p className="text-warn text-sm">{error}</p>
      ) : !serialized ? (
        <p className="text-muted-foreground text-sm">
          {loading ? 'Renderizando…' : 'Comece a escrever…'}
        </p>
      ) : (
        <div
          className="prose prose-invert post-prose max-w-none"
          aria-busy={loading}
        >
          <MDXRemote {...serialized} components={mdxComponents} />
        </div>
      )}
    </div>
  )
}
