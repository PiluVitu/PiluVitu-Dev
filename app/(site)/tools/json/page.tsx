import type { Metadata } from 'next'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { JsonTool } from '@/components/tools/json-tool'

const tool = TOOLS.find((t) => t.slug === 'json')!

export const metadata: Metadata = { title: tool.title }

export default function JsonPage() {
  return (
    <ToolPageShell tool={tool}>
      <JsonTool />
    </ToolPageShell>
  )
}
