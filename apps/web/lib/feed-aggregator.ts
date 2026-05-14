import 'server-only'

import Parser from 'rss-parser'
import { getFeeds } from '@/lib/site-content'
import type { AggregatedFeedsResponse, AggregatedPost } from '@/mocks/feeds'

type RssItem = Parser.Item & {
  mediaContent?: { $?: { url?: string } }
  mediaThumbnail?: { $?: { url?: string } }
}

type CustomParser = Parser<Record<string, unknown>, RssItem>

const parser: CustomParser = new Parser({
  timeout: 8000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: false }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: false }],
    ],
  },
})

function extractCoverImage(item: RssItem): string | undefined {
  if (item.enclosure?.url) return item.enclosure.url
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url
  return undefined
}

function truncate(text: string, max = 160): string {
  const clean = text.replace(/<[^>]+>/g, '').trim()
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean
}

export async function aggregateFeeds(): Promise<AggregatedFeedsResponse> {
  const sources = (await getFeeds()).filter((f) => f.enabled && f.url)

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const res = await fetch(source.url, {
        next: { revalidate: 1800 },
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.url}`)
      const text = await res.text()
      const feed = await parser.parseString(text)

      return feed.items.map((item): AggregatedPost => {
        const link = item.link ?? item.guid ?? ''
        const publishedAt =
          item.isoDate ??
          (item.pubDate
            ? new Date(item.pubDate).toISOString()
            : new Date(0).toISOString())

        return {
          id: link || `${source.id}-${publishedAt}`,
          title: (item.title ?? '').trim(),
          link,
          snippet: truncate(
            item.contentSnippet ?? item.content ?? item.summary ?? '',
          ),
          publishedAt,
          coverImage: extractCoverImage(item),
          source: {
            id: source.id,
            name: source.name,
            accentColor: source.accentColor,
            category: source.category,
          },
        }
      })
    }),
  )

  const items: AggregatedPost[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value)
    } else {
      console.error(
        `[feed-aggregator] Failed to fetch "${sources[i].name}":`,
        result.reason,
      )
    }
  })

  items.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )

  const feedsIndex = sources
    .filter((_, i) => results[i].status === 'fulfilled')
    .map((s) => ({
      id: s.id,
      name: s.name,
      accentColor: s.accentColor,
      category: s.category,
    }))

  const categories = [
    ...new Set(feedsIndex.map((f) => f.category).filter(Boolean)),
  ] as string[]

  return { items, feeds: feedsIndex, categories }
}
