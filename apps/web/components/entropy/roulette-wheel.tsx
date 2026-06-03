'use client'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface WheelOption {
  id: number | string
  label: string
}

interface Props {
  options: WheelOption[]
  /** When set (and spinning was requested), the wheel lands on this option. */
  winnerId: number | string | null
  spinning: boolean
  onSpinEnd?: (winnerId: number | string) => void
  className?: string
}

// Paleta DS V2 (ciano / verde / roxo / âmbar / rosa / teal / laranja / azul).
const PALETTE = [
  '#38bdf8',
  '#34d399',
  '#a78bfa',
  '#fbbf24',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#60a5fa',
]
const SPIN_MS = 4000
const EXTRA_TURNS = 6

/**
 * Conic-gradient roulette. Lands deterministically on `winnerId` when spinning.
 * Pure presentation — it does not decide the winner; the caller passes it in.
 * The accumulated angle is tracked in a ref so repeat spins always rotate
 * forward (never snap backward) regardless of the previous resting angle.
 */
export function RouletteWheel({
  options,
  winnerId,
  spinning,
  onSpinEnd,
  className,
}: Props) {
  const [angle, setAngle] = useState(0)
  const accRef = useRef(0)
  const firedRef = useRef(false)
  const onSpinEndRef = useRef(onSpinEnd)
  useEffect(() => {
    onSpinEndRef.current = onSpinEnd
  })

  const n = Math.max(options.length, 1)
  const slice = 360 / n

  useEffect(() => {
    if (!spinning || winnerId == null) return
    const idx = Math.max(
      0,
      options.findIndex((o) => o.id === winnerId),
    )
    // Angle (mod 360) that puts the winning slice's center under the top pointer.
    const offset = 360 - (idx * slice + slice / 2)
    const cur = ((accRef.current % 360) + 360) % 360
    // Always move forward: full turns + the forward delta to reach `offset`.
    const delta = EXTRA_TURNS * 360 + ((((offset - cur) % 360) + 360) % 360)
    const target = accRef.current + delta
    accRef.current = target
    firedRef.current = false

    setAngle(target)
    const t = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true
        onSpinEndRef.current?.(winnerId)
      }
    }, SPIN_MS + 50)
    return () => clearTimeout(t)
    // `options`/`slice` are read at spin start only; `onSpinEnd` via ref — so a
    // re-render during the spin doesn't reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerId])

  const gradient = options
    .map(
      (_, i) =>
        `${PALETTE[i % PALETTE.length]} ${i * slice}deg ${(i + 1) * slice}deg`,
    )
    .join(', ')

  return (
    <div
      className={cn(
        'relative mx-auto aspect-square w-72 max-w-full',
        className,
      )}
    >
      {/* ponteiro */}
      <div
        aria-hidden="true"
        className="absolute -top-1 left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-white drop-shadow-md"
      />

      {/* bezel escuro */}
      <div className="shadow-ds absolute inset-0 rounded-full bg-[#0e1526] p-2.5">
        {/* roda giratória */}
        <div
          role="img"
          aria-label={
            winnerId != null
              ? `Roleta — vencedor: ${options.find((o) => o.id === winnerId)?.label ?? ''}`
              : 'Roleta de sorteio'
          }
          className="relative h-full w-full overflow-hidden rounded-full"
          style={{
            background: n > 1 ? `conic-gradient(${gradient})` : PALETTE[0],
            transform: `rotate(${angle}deg)`,
            transition: spinning
              ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
              : 'none',
          }}
        >
          {options.map((o, i) => {
            const mid = i * slice + slice / 2
            // metade inferior: flip 180° pro texto não ficar de cabeça pra baixo
            const flip = mid > 90 && mid < 270
            return (
              <span
                key={o.id}
                className="pointer-events-none absolute top-1/2 left-1/2 max-w-[38%] truncate text-sm font-bold text-[#0b1220]"
                style={{
                  transform: `translate(-50%, -50%) rotate(${mid}deg) translateY(-86px) rotate(${flip ? 180 : 0}deg)`,
                }}
              >
                {o.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* hub central */}
      <div
        aria-hidden="true"
        className="border-primary absolute top-1/2 left-1/2 z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 bg-[#0b1220]"
      >
        <span className="bg-primary h-2.5 w-2.5 rounded-full" />
      </div>
    </div>
  )
}
