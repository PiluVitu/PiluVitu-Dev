'use client'

import { useEffect, useRef } from 'react'

type MermaidBlockProps = {
  chart: string
}

/**
 * Client-side mermaid diagram renderer.
 * Lazily imports `mermaid` only in the browser to avoid SSR issues.
 */
export function MermaidBlock({ chart }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const { default: mermaid } = await import('mermaid')
      mermaid.initialize({ startOnLoad: false, theme: 'neutral' })

      if (!containerRef.current || cancelled) return

      const id = `mermaid-${Math.random().toString(36).slice(2)}`
      try {
        const { svg } = await mermaid.render(id, chart)
        if (containerRef.current && !cancelled) {
          containerRef.current.innerHTML = svg
        }
      } catch {
        if (containerRef.current && !cancelled) {
          containerRef.current.textContent = `[mermaid error] ${chart}`
        }
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [chart])

  return (
    <div
      ref={containerRef}
      className="my-6 overflow-x-auto rounded-lg border p-4"
      aria-label="Diagrama mermaid"
    />
  )
}
