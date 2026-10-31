'use client'
import { useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useGirarRoleta } from '@/hooks/votacao/use-girar-roleta'
import { errorMessage } from '@/lib/votacao/api-client'
import { CameraEntropyCapture } from '@/components/entropy/camera-entropy-capture'
import {
  RouletteWheel,
  type WheelOption,
} from '@/components/entropy/roulette-wheel'
import type { SessionMovie } from '@/lib/votacao/types'
import type { EntropyResult } from '@/hooks/use-camera-entropy'

interface Props {
  sessionId: number
  movies: SessionMovie[]
  isAdmin: boolean
  /** Vencedor já gravado (sessão encerrada). */
  winnerMovieId?: number | null
}

/**
 * Roleta da sessão de Halloween: o admin gira com a entropia da câmera (a foto
 * não sai do navegador), o servidor sorteia entre os filmes da sessão e a roda
 * pousa no vencedor. Quem não é admin só vê os candidatos e o resultado.
 */
export function HalloweenRoleta({
  sessionId,
  movies,
  isAdmin,
  winnerMovieId,
}: Props) {
  const girar = useGirarRoleta(sessionId)
  const [sorteado, setSorteado] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)

  // O giro desta tela manda: o refetch da sessão encerrada chega no meio da
  // animação e não pode revelar o vencedor antes de a roda parar.
  const vencedorId = sorteado ?? winnerMovieId ?? null
  const revelado = vencedorId != null && !spinning
  const vencedor = revelado ? movies.find((m) => m.ID === vencedorId) : null

  const options: WheelOption[] = movies.map((m) => ({
    id: m.ID,
    label: m.Title,
  }))

  function sortear(entropy: string) {
    girar.mutate(entropy, {
      onSuccess: (res) => {
        setSorteado(res.winner_movie_id)
        setSpinning(true)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  return (
    <section className="space-y-6" data-testid="roleta-halloween">
      <h2 className="text-2xl font-bold tracking-tight">
        {revelado ? 'O filme da noite' : 'A roleta da noite'}
      </h2>

      <RouletteWheel
        options={options}
        winnerId={sorteado}
        spinning={spinning}
        className="w-80"
        onSpinEnd={(id) => {
          setSpinning(false)
          const title = options.find((o) => o.id === id)?.label
          toast.success(`🎃 O filme da noite: ${title}`)
        }}
      />

      {vencedor && (
        <div
          data-testid="roleta-vencedor"
          className="halloween-card bg-card mx-auto flex max-w-sm items-center gap-4 rounded-lg border p-4"
        >
          {vencedor.PosterURL ? (
            <Image
              src={vencedor.PosterURL}
              alt=""
              width={64}
              height={96}
              className="h-24 w-16 rounded object-cover"
            />
          ) : (
            <span aria-hidden="true" className="text-5xl">
              🎃
            </span>
          )}
          <div>
            <p className="text-primary text-xs font-semibold uppercase">
              🏆 Vencedor da roleta
            </p>
            <p className="text-lg font-bold">{vencedor.Title}</p>
          </div>
        </div>
      )}

      {vencedorId == null &&
        (isAdmin ? (
          <CameraEntropyCapture
            label={girar.isPending ? 'Sorteando…' : '🎃 Girar a roleta'}
            disabled={girar.isPending}
            onEntropy={(r: EntropyResult) => sortear(r.digestHex)}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            Aguardando quem organiza a sessão girar a roleta.
          </p>
        ))}

      <div className="space-y-2">
        <h3 className="text-muted-foreground text-sm font-medium">
          {movies.length} filmes na roleta
        </h3>
        <ul className="flex flex-wrap gap-2">
          {movies.map((m) => (
            <li
              key={m.ID}
              className={cn(
                'bg-card rounded-full border px-3 py-1 text-xs',
                revelado &&
                  m.ID === vencedorId &&
                  'border-primary text-primary font-semibold',
              )}
            >
              {m.Title}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
