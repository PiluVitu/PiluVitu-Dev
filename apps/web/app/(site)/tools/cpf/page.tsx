import type { Metadata } from 'next'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { CpfTool } from '@/components/tools/cpf-tool'

const tool = TOOLS.find((t) => t.slug === 'cpf')!

export const metadata: Metadata = { title: tool.title }

export default function CpfPage() {
  return (
    <ToolPageShell tool={tool}>
      <CpfTool />
    </ToolPageShell>
  )
}
