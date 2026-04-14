import { cn } from '@/lib/utils'
import type { AggregatedPost } from '@/mocks/feeds'
import Image from 'next/image'
import Link from 'next/link'

type FeedPostCardProps = {
  post: AggregatedPost
  className?: string
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export function FeedPostCard({ post, className }: FeedPostCardProps) {
  return (
    <Link
      href={post.link}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn(
        'bg-card text-card-foreground border shadow-sm',
        'flex h-fit w-full flex-col justify-between gap-3 rounded-3xl p-5 transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        'focus-visible:ring-ring focus-visible:ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        className,
      )}
    >
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: post.source.accentColor }}
            aria-hidden
          />
          <span className="text-muted-foreground truncate text-xs font-medium">
            {post.source.name}
            {post.source.category ? ` · ${post.source.category}` : ''}
          </span>
        </div>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">
          {post.title}
        </h3>
        {post.snippet ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {post.snippet}
          </p>
        ) : null}
        <time
          dateTime={post.publishedAt}
          className="text-muted-foreground text-xs"
        >
          {formatDate(post.publishedAt)}
        </time>
      </section>
      {post.coverImage ? (
        <div className="relative mx-auto flex h-fit w-full shrink-0 overflow-hidden rounded-lg border">
          <Image
            alt=""
            loading="lazy"
            width={400}
            height={200}
            src={post.coverImage}
            className="h-40 w-full object-cover object-center"
            unoptimized
          />
        </div>
      ) : null}
    </Link>
  )
}
