import type { ArticleCardView } from '@/lib/article-feed'
import { cn } from '@/lib/utils'
import { faComment, faThumbsUp } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Image from 'next/image'
import Link from 'next/link'

type ArticleCardProps = {
  article: ArticleCardView
  className?: string
}

export function ArticleCard({ article, className }: ArticleCardProps) {
  const reactions = article.reactionsCount
  const comments = article.commentsCount

  return (
    <Link
      href={article.href}
      target={article.isExternal ? '_blank' : undefined}
      rel={article.isExternal ? 'noopener noreferrer nofollow' : undefined}
      className={cn(
        'bg-card text-card-foreground border shadow-sm',
        'flex h-fit w-full flex-col justify-between gap-4 rounded-3xl p-5 transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        'focus-visible:ring-ring focus-visible:ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        className,
      )}
    >
      <section className="flex flex-col justify-center gap-4">
        <h3 className="truncate text-xl">{article.title}</h3>
        <p className="text-muted-foreground">
          Tempo de leitura: {article.readingTimeMinutes}min
        </p>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground flex items-center gap-2">
            <FontAwesomeIcon
              icon={faThumbsUp}
              className={cn(
                'h-4 w-4 shrink-0 transition-colors',
                reactions > 0 ? 'text-success' : 'text-muted-foreground',
              )}
              aria-hidden
            />
            <span className={cn(reactions > 0 && 'text-success font-medium')}>
              {reactions}
            </span>
          </p>
          <p className="text-muted-foreground flex items-center gap-2">
            <FontAwesomeIcon
              icon={faComment}
              className={cn(
                'h-4 w-4 shrink-0 transition-colors',
                comments > 0 ? 'text-success' : 'text-muted-foreground',
              )}
              aria-hidden
            />
            <span className={cn(comments > 0 && 'text-success font-medium')}>
              {comments}
            </span>
          </p>
        </div>
      </section>
      {article.socialImage ? (
        <div className="relative mx-auto flex h-fit w-72 max-w-full shrink-0 overflow-hidden rounded-lg border">
          <Image
            alt=""
            loading="lazy"
            width={288}
            height={144}
            src={article.socialImage}
            className="h-auto w-full object-cover object-center"
          />
        </div>
      ) : null}
    </Link>
  )
}
