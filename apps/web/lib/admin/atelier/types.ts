export type DistributionKind = 'article_crosspost' | 'social_hook'
export type DistributionStatus = 'pending' | 'posted' | 'failed' | 'skipped'

export interface DistributionTarget {
  slug: string
  platform: string
  kind: DistributionKind
  content: string
  status: DistributionStatus
  remote_url: string
  error: string
}

export interface SelectedTarget {
  platform: string
  content: string
  title?: string
  canonical_url?: string
  description?: string
  tags?: string[]
}

export interface ProposalsBody {
  slug: string
  title: string
  excerpt: string
  url: string
  body: string
  tags: string[]
}
