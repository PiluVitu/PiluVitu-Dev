import { DataArticle } from '@/hooks/useArticleData'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'

type ArticleCardProps = {
  article: DataArticle
  className?: string
}

export function ArticleCard({ article, className }: ArticleCardProps) {
  return (
    <Link
      href={article.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn(
        'bg-card text-card-foreground border shadow-sm',
        'flex h-fit w-full flex-col justify-between gap-4 rounded-3xl p-5 transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <section className="flex flex-col justify-center gap-4">
        <h3 className="line-clamp-2 max-h-14 text-xl">{article.title}</h3>
        <p className="text-muted-foreground">
          Tempo de leitura: {article.reading_time_minutes}min
        </p>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground flex items-center">
            👍 {article.positive_reactions_count}
          </p>
          <p className="text-muted-foreground flex items-center">
            💬 {article.comments_count}
          </p>
        </div>
      </section>
      {article.social_image ? (
        <div className="relative my-auto flex h-fit w-72 shrink-0 overflow-hidden rounded-lg border xl:mx-auto">
          <Image
            alt=""
            loading="lazy"
            width={288}
            height={144}
            src={article.social_image}
            className="object-cover"
          />
        </div>
      ) : null}
    </Link>
  )
}
