export type FeedSource = {
  id: string
  name: string
  url: string
  siteUrl?: string
  category?: string
  accentColor: string
  order: number
  enabled: boolean
}

export type AggregatedPost = {
  id: string
  title: string
  link: string
  snippet: string
  publishedAt: string
  coverImage?: string
  source: {
    id: string
    name: string
    accentColor: string
    category?: string
  }
}

export type AggregatedFeedsResponse = {
  items: AggregatedPost[]
  feeds: Pick<FeedSource, 'id' | 'name' | 'accentColor' | 'category'>[]
  categories: string[]
}
