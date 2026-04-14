'use client'

import { FeedFilters } from '@/components/feed/feed-filters'
import { FeedLoadMore } from '@/components/feed/feed-load-more'
import { FeedPostCard } from '@/components/feed/feed-post-card'
import { FeedSearch } from '@/components/feed/feed-search'
import { useAggregatedFeeds } from '@/hooks/useAggregatedFeeds'
import type { AggregatedPost } from '@/mocks/feeds'
import { useState } from 'react'

const PAGE_SIZE = 20

export default function FeedPage() {
  const { data, isLoading, isError } = useAggregatedFeeds()
  const [search, setSearch] = useState('')
  const [selectedFeeds, setSelectedFeeds] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [visible, setVisible] = useState(PAGE_SIZE)

  function toggleFeed(id: string) {
    setSelectedFeeds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    )
    setVisible(PAGE_SIZE)
  }

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
    setVisible(PAGE_SIZE)
  }

  function clearFilters() {
    setSelectedFeeds([])
    setSelectedCategories([])
    setVisible(PAGE_SIZE)
  }

  function handleSearch(value: string) {
    setSearch(value)
    setVisible(PAGE_SIZE)
  }

  const filtered: AggregatedPost[] = (data?.items ?? []).filter((post) => {
    if (
      selectedFeeds.length > 0 &&
      !selectedFeeds.includes(post.source.id)
    )
      return false
    if (
      selectedCategories.length > 0 &&
      (!post.source.category ||
        !selectedCategories.includes(post.source.category))
    )
      return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        post.title.toLowerCase().includes(q) ||
        post.snippet.toLowerCase().includes(q)
      )
    }
    return true
  })

  const sliced = filtered.slice(0, visible)

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10" suppressHydrationWarning>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Feed</h1>
        <p className="text-muted-foreground text-sm">
          Posts recentes dos feeds que sigo
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <FeedSearch value={search} onChange={handleSearch} />
        {data && (data.categories.length > 0 || data.feeds.length > 0) ? (
          <FeedFilters
            feeds={data.feeds}
            categories={data.categories}
            selectedFeeds={selectedFeeds}
            selectedCategories={selectedCategories}
            onToggleFeed={toggleFeed}
            onToggleCategory={toggleCategory}
            onClear={clearFilters}
          />
        ) : null}
      </div>

      {isLoading && (
        <div className="text-muted-foreground py-16 text-center text-sm">
          Carregando feeds…
        </div>
      )}

      {isError && (
        <div className="text-muted-foreground py-16 text-center text-sm">
          Não foi possível carregar os feeds. Tente novamente mais tarde.
        </div>
      )}

      {!isLoading && !isError && sliced.length === 0 && (
        <div className="text-muted-foreground py-16 text-center text-sm">
          Nenhum post encontrado.
          {(search || selectedFeeds.length > 0 || selectedCategories.length > 0) && (
            <> Tente limpar os filtros.</>
          )}
        </div>
      )}

      {sliced.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sliced.map((post) => (
            <FeedPostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {!isLoading && !isError && (
        <FeedLoadMore
          visible={Math.min(visible, filtered.length)}
          total={filtered.length}
          onLoadMore={() => setVisible((v) => v + PAGE_SIZE)}
        />
      )}
    </main>
  )
}
