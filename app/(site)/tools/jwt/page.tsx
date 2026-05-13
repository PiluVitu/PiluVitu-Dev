import type { Metadata } from 'next'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { JwtTool } from '@/components/tools/jwt-tool'

const tool = TOOLS.find((t) => t.slug === 'jwt')!

export const metadata: Metadata = { title: tool.title }

export default function JwtPage() {
  return (
    <ToolPageShell tool={tool}>
      <JwtTool />
    </ToolPageShell>
  )
}
