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
        'group bg-card relative flex flex-col overflow-hidden rounded-lg border text-left transition-all',
        selected && 'ring-primary ring-2',
        disabled && 'cursor-not-allowed opacity-60',
        !disabled && 'hover:shadow-lg',
      )}
    >
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
