'use client'

import { UseArticleData } from '@/hooks/useArticleData'
import {
  type ArticleCardView,
  devToToView,
  mergeFeed,
} from '@/lib/article-feed'
import { ArticleCard } from './article-card'

type ArticleSectionProps = {
  initialBlogPosts?: ArticleCardView[]
}

export function ArticleSection({ initialBlogPosts = [] }: ArticleSectionProps) {
  const { data } = UseArticleData()

  const devtoPosts = (data ?? []).map(devToToView)
  const merged = mergeFeed(devtoPosts, initialBlogPosts)

  return (
    <>
      {merged.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </>
  )
}
