'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useResults } from '@/hooks/votacao/use-session-detail'
import { useCreateTiebreak } from '@/hooks/votacao/use-create-tiebreak'
import { analyzeResults } from '@/lib/votacao/results'
import { errorMessage } from '@/lib/votacao/api-client'
import { CameraEntropyCapture } from '@/components/entropy/camera-entropy-capture'
import {
  RouletteWheel,
  type WheelOption,
} from '@/components/entropy/roulette-wheel'
import type { SessionMovie } from '@/lib/votacao/types'
import type { EntropyResult } from '@/hooks/use-camera-entropy'

/**
 * Admin tie-break via roulette. Mount only in the closed branch so useResults
 * doesn't fire for open sessions. Captures camera entropy locally (photo never
 * leaves the browser), asks the server to draw, then animates to the winner.
 */
export function TiebreakRoulette({
  sessionId,
  movies,
}: {
  sessionId: number
  movies: SessionMovie[]
}) {
  const { data } = useResults(sessionId)
  const tiebreak = useCreateTiebreak(sessionId)
  const [winnerId, setWinnerId] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)

  if (!data) return null
  const { isTie, topMovieIds } = analyzeResults(data.results)
  if (!isTie) return null

  const options: WheelOption[] = topMovieIds.map((id) => ({
    id,
    label: movies.find((m) => m.ID === id)?.Title ?? `Filme ${id}`,
  }))

  function draw(entropy: string) {
    tiebreak.mutate(entropy, {
      onSuccess: (res) => {
        setWinnerId(res.winner_movie_id)
        setSpinning(true)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {topMovieIds.length} filmes empatados. Gire a roleta — a entropia da sua
        câmera reforça o sorteio (a foto não sai do navegador).
      </p>
      <RouletteWheel
        options={options}
        winnerId={winnerId}
        spinning={spinning}
        onSpinEnd={(id) => {
          setSpinning(false)
          const title = options.find((o) => o.id === id)?.label
          toast.success(`Vencedor do desempate: ${title}`)
        }}
      />
      {winnerId == null && (
        <CameraEntropyCapture
          label={
            tiebreak.isPending ? 'Sorteando…' : '🎲 Girar a roleta de desempate'
          }
          disabled={tiebreak.isPending}
          onEntropy={(r: EntropyResult) => draw(r.digestHex)}
        />
      )}
    </div>
  )
}
