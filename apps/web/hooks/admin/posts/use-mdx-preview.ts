'use client'
import { useEffect, useRef, useState } from 'react'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'

export function useMdxPreview(mdx: string, delay = 500) {
  const [serialized, setSerialized] = useState<MDXRemoteSerializeResult | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/posts/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mdx }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error?.message ?? 'Falha no preview')
        setSerialized(body.serialized)
        setError(null)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }, delay)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [mdx, delay])

  return { serialized, error, loading }
}
