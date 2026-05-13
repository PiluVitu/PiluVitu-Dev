import type { Metadata } from 'next'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { UuidTool } from '@/components/tools/uuid-tool'

const tool = TOOLS.find((t) => t.slug === 'uuid')!

export const metadata: Metadata = { title: tool.title }

export default function UuidPage() {
  return (
    <ToolPageShell tool={tool}>
      <UuidTool />
    </ToolPageShell>
  )
}
