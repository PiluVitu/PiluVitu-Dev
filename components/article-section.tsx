import type { ArticleCardView } from '@/lib/article-feed'
import { ArticleCard } from './article-card'

type ArticleSectionProps = {
  initialBlogPosts?: ArticleCardView[]
}

export function ArticleSection({ initialBlogPosts = [] }: ArticleSectionProps) {
  return (
    <>
      {initialBlogPosts.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </>
  )
}
