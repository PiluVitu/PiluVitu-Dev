'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'
import type { ToolMeta } from '@/lib/tools-registry'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function ToolCard({ tool }: { tool: ToolMeta }) {
  return (
    <Link href={`/tools/${tool.slug}`} className="group outline-none">
      <Card className="hover:border-primary/50 focus-within:border-primary/50 group-focus-visible:ring-ring h-full cursor-pointer transition-colors group-focus-visible:ring-2">
        <CardHeader className="pb-2">
          <div className="bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-lg">
            <FontAwesomeIcon icon={tool.icon} className="h-5 w-5" />
          </div>
          <CardTitle className="text-base">{tool.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription>{tool.description}</CardDescription>
        </CardContent>
      </Card>
    </Link>
  )
}
