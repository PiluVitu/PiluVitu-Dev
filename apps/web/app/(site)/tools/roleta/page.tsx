import type { Metadata } from 'next'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { RoletaTool } from '@/components/tools/roleta-tool'

const tool = TOOLS.find((t) => t.slug === 'roleta')!

export const metadata: Metadata = { title: tool.title }

export default function RoletaPage() {
  return (
    <ToolPageShell tool={tool}>
      <RoletaTool />
    </ToolPageShell>
  )
}
