import type { ArticleCardView } from '@/lib/article-feed'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type ArticleCardProps = {
  article: ArticleCardView
  index?: number
  className?: string
}

export function ArticleCard({ article, index, className }: ArticleCardProps) {
  const kbd = article.source === 'devto' ? '~/dev' : '~/blog'
  const post = index !== undefined ? String(index + 1).padStart(2, '0') : null

  return (
    <Link
      href={article.href}
      target={article.isExternal ? '_blank' : undefined}
      rel={article.isExternal ? 'noopener noreferrer nofollow' : undefined}
      className={cn(
        'group bg-card border-border flex h-full flex-col gap-4 rounded-lg border p-5 transition-colors',
        'hover:bg-accent',
        'focus-visible:ring-ring focus-visible:ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        className,
      )}
    >
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="bg-accent-soft text-primary rounded px-1.5 py-0.5">
          {kbd}
        </span>
        {post ? (
          <span className="text-muted-foreground">· post {post}</span>
        ) : null}
      </div>
      <h3 className="line-clamp-2 text-lg font-semibold">{article.title}</h3>
      <div className="text-muted-foreground mt-auto flex items-center justify-between font-mono text-xs">
        <span>{article.readingTimeMinutes} min de leitura</span>
        <span className="text-primary transition-transform group-hover:translate-x-0.5">
          ler →
        </span>
      </div>
    </Link>
  )
}
