import type { ArticleCardView } from '@/lib/article-feed'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'

type ArticleCardProps = {
  article: ArticleCardView
  className?: string
}

export function ArticleCard({ article, className }: ArticleCardProps) {
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
      </section>
      <div className="relative mx-auto flex h-fit w-72 max-w-full shrink-0 overflow-hidden rounded-lg border">
        {article.socialImage ? (
          <Image
            alt=""
            loading="lazy"
            width={288}
            height={144}
            src={article.socialImage}
            className="h-auto w-full object-cover object-center"
          />
        ) : (
          <div
            className="flex h-36 w-full flex-col items-start justify-end gap-2 bg-gradient-to-br from-slate-800 to-slate-950 p-4"
            aria-hidden
          >
            <p className="line-clamp-3 text-sm font-semibold leading-snug text-white">
              {article.title}
            </p>
            <span className="text-xs text-slate-400">
              {article.readingTimeMinutes} min de leitura
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
