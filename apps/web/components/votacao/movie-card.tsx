'use client'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  movie: SessionMovie
  selected?: boolean
  /** Marks this card as the movie the current user voted for. */
  youVoted?: boolean
  onSelect?: () => void
  disabled?: boolean
}

export function MovieCard({
  movie,
  selected,
  youVoted,
  onSelect,
  disabled,
}: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={youVoted}
      className={cn(
        'group bg-card relative flex flex-col overflow-hidden rounded-lg border text-left transition-all',
        selected && !youVoted && 'ring-primary ring-2',
        youVoted && 'ring-success ring-2',
        // Keep the chosen card fully visible even when voting is locked.
        disabled && !youVoted && 'cursor-not-allowed opacity-60',
        !disabled && 'hover:shadow-lg',
      )}
    >
      {youVoted && (
        <span className="bg-success text-success-foreground absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shadow">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
          Seu voto
        </span>
      )}
      <div className="bg-muted aspect-[2/3] w-full">
        {movie.PosterURL ? (
          <Image
            src={movie.PosterURL}
            alt={movie.Title}
            width={400}
            height={600}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            sem pôster
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          {movie.Category}
        </p>
        <h3 className="leading-tight font-semibold">{movie.Title}</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          {movie.Type === 'serie' ? 'Série' : 'Filme'}
          {movie.WasWatched && ' • já assistido'}
        </p>
      </div>
    </button>
  )
}
