'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'
import type { ToolMeta } from '@/lib/tools-registry'

export function ToolCard({ tool }: { tool: ToolMeta }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group bg-card border-border hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background flex h-full flex-col gap-5 rounded-lg border p-6 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <div className="bg-accent-soft text-primary flex size-11 items-center justify-center rounded-xl">
        <FontAwesomeIcon icon={tool.icon} className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{tool.title}</h3>
        <p className="text-muted-foreground text-sm">{tool.description}</p>
      </div>
    </Link>
  )
}
