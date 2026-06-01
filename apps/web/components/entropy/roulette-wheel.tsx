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

const PALETTE = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]
const SPIN_MS = 4000
const EXTRA_TURNS = 6

/**
 * Conic-gradient roulette. Lands deterministically on `winnerId` when spinning.
 * Pure presentation — it does not decide the winner; the caller passes it in.
 */
export function RouletteWheel({
  options,
  winnerId,
  spinning,
  onSpinEnd,
  className,
}: Props) {
  const [angle, setAngle] = useState(0)
  const firedRef = useRef(false)
  const n = Math.max(options.length, 1)
  const slice = 360 / n

  useEffect(() => {
    if (!spinning || winnerId == null) return
    const idx = Math.max(
      0,
      options.findIndex((o) => o.id === winnerId),
    )
    firedRef.current = false
    const target = EXTRA_TURNS * 360 + (360 - (idx * slice + slice / 2))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- CSS transition requires synchronous angle update inside effect
    setAngle(target)
    const t = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true
        onSpinEnd?.(winnerId)
      }
    }, SPIN_MS + 50)
    return () => clearTimeout(t)
  }, [spinning, winnerId, options, slice, onSpinEnd])

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
      <div
        aria-hidden="true"
        className="border-t-foreground absolute -top-2 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-8 border-t-[16px] border-x-transparent"
      />
      <div
        role="img"
        aria-label={
          winnerId != null
            ? `Roleta — vencedor: ${options.find((o) => o.id === winnerId)?.label ?? ''}`
            : 'Roleta de sorteio'
        }
        className="border-foreground/20 h-full w-full rounded-full border-4 shadow-inner"
        style={{
          background: n > 1 ? `conic-gradient(${gradient})` : PALETTE[0],
          transform: `rotate(${angle}deg)`,
          transition: spinning
            ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
            : 'none',
        }}
      />
      <div className="bg-background border-foreground/30 absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" />
    </div>
  )
}
