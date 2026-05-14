import type { Metadata } from 'next'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { QrGeneratorTool } from '@/components/tools/qr-generator-tool'

const tool = TOOLS.find((t) => t.slug === 'qr-generator')!

export const metadata: Metadata = { title: tool.title }

export default function QrGeneratorPage() {
  return (
    <ToolPageShell tool={tool}>
      <QrGeneratorTool />
    </ToolPageShell>
  )
}
