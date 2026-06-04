import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number | string
  hint?: ReactNode
  className?: string
}

export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'border-border bg-card shadow-ds rounded-[var(--radius)] border p-6',
        className,
      )}
    >
      <p className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.18em] uppercase">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="text-muted-foreground mt-2 text-sm">{hint}</p>
      ) : null}
    </div>
  )
}
