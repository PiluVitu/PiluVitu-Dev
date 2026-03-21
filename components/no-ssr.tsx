'use client'

import { useEffect, useState } from 'react'

interface NoSSRProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function NoSSR({ children, fallback = null }: NoSSRProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Gate de montagem no cliente (evita mismatch de hidratação).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intencional
    setMounted(true)
  }, [])

  if (!mounted) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
