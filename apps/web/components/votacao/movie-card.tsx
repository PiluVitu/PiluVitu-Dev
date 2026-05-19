'use client'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  movie: SessionMovie
  selected?: boolean
  onSelect?: () => void
  disabled?: boolean
}

export function MovieCard({ movie, selected, onSelect, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-all',
        selected && 'ring-2 ring-primary',
        disabled && 'cursor-not-allowed opacity-60',
        !disabled && 'hover:shadow-lg',
      )}
    >
      <div className="aspect-[2/3] w-full bg-muted">
        {movie.PosterURL ? (
          <Image
            src={movie.PosterURL}
            alt={movie.Title}
            width={400}
            height={600}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            sem pôster
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {movie.Category}
        </p>
        <h3 className="font-semibold leading-tight">{movie.Title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {movie.Type === 'serie' ? 'Série' : 'Filme'}
          {movie.WasWatched && ' • já assistido'}
        </p>
      </div>
    </button>
  )
}
