'use client'

import Link from 'next/link'
import type { AdminPostListItem } from '@/lib/admin/post-io'

export function PostsTable(props: {
  posts: AdminPostListItem[]
  onDelete: (slug: string) => void
}) {
  return (
    <div className="border-border overflow-hidden rounded-[var(--radius)] border">
      <div className="text-muted-foreground grid grid-cols-[3fr_1fr_1fr_1.2fr_auto] gap-4 px-5 py-3 font-mono text-xs uppercase">
        <span>Título</span>
        <span>Status</span>
        <span>Leitura</span>
        <span>Atualizado</span>
        <span />
      </div>
      {props.posts.map((p) => (
        <div
          key={p.slug}
          className="border-border grid grid-cols-[3fr_1fr_1fr_1.2fr_auto] items-center gap-4 border-t px-5 py-3"
        >
          <Link href={`/admin/posts/${p.slug}`} className="min-w-0">
            <span className="block truncate font-medium">{p.title}</span>
            <span className="text-muted-foreground block truncate font-mono text-xs">
              {p.slug}
            </span>
          </Link>
          <span
            className={
              p.draft ? 'text-muted-foreground text-xs' : 'text-primary text-xs'
            }
          >
            {p.draft ? 'Rascunho' : '● Publicado'}
          </span>
          <span className="text-muted-foreground font-mono text-xs">
            {p.readingTimeMinutes} min
          </span>
          <span className="text-muted-foreground font-mono text-xs">
            {p.publishedAt?.slice(0, 10)}
          </span>
          <button
            className="text-warn text-sm"
            onClick={() => props.onDelete(p.slug)}
          >
            Apagar
          </button>
        </div>
      ))}
      {props.posts.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">
          Nenhum post ainda.
        </p>
      ) : null}
    </div>
  )
}
