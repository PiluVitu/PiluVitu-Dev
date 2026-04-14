'use client'

import { cn } from '@/lib/utils'
import type { AggregatedFeedsResponse } from '@/mocks/feeds'

type FeedFiltersProps = {
  feeds: AggregatedFeedsResponse['feeds']
  categories: string[]
  selectedFeeds: string[]
  selectedCategories: string[]
  onToggleFeed: (id: string) => void
  onToggleCategory: (cat: string) => void
  onClear: () => void
}

export function FeedFilters({
  feeds,
  categories,
  selectedFeeds,
  selectedCategories,
  onToggleFeed,
  onToggleCategory,
  onClear,
}: FeedFiltersProps) {
  const hasActive = selectedFeeds.length > 0 || selectedCategories.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onToggleCategory(cat)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            selectedCategories.includes(cat)
              ? 'bg-foreground text-background border-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground border',
          )}
        >
          {cat}
        </button>
      ))}
      {feeds.map((feed) => (
        <button
          key={feed.id}
          onClick={() => onToggleFeed(feed.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            selectedFeeds.includes(feed.id)
              ? 'bg-foreground text-background border-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground border',
          )}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: feed.accentColor }}
            aria-hidden
          />
          {feed.name}
        </button>
      ))}
      {hasActive && (
        <button
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground rounded-full px-3 py-1 text-xs underline-offset-2 transition-colors hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}
