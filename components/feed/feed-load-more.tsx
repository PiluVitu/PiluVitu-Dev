'use client'

import { cn } from '@/lib/utils'

type FeedLoadMoreProps = {
  visible: number
  total: number
  onLoadMore: () => void
  className?: string
}

export function FeedLoadMore({
  visible,
  total,
  onLoadMore,
  className,
}: FeedLoadMoreProps) {
  if (visible >= total) return null

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <p className="text-muted-foreground text-sm">
        Mostrando {visible} de {total} posts
      </p>
      <button
        onClick={onLoadMore}
        className="bg-card border-input hover:bg-accent rounded-full border px-6 py-2 text-sm font-medium transition-colors"
      >
        Carregar mais
      </button>
    </div>
  )
}
