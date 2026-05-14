'use client'

import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

type FeedSearchProps = {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function FeedSearch({ value, onChange, className }: FeedSearchProps) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocal(value)
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setLocal(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(next), 300)
  }

  return (
    <input
      type="search"
      value={local}
      onChange={handleChange}
      placeholder="Buscar posts…"
      className={cn(
        'bg-card border-input placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-xl border px-4 py-2 text-sm outline-none focus-visible:ring-2',
        className,
      )}
      aria-label="Buscar posts"
    />
  )
}
