import type { Metadata } from 'next'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { QrReaderTool } from '@/components/tools/qr-reader-tool'

const tool = TOOLS.find((t) => t.slug === 'qr-reader')!

export const metadata: Metadata = { title: tool.title }

export default function QrReaderPage() {
  return (
    <ToolPageShell tool={tool}>
      <QrReaderTool />
    </ToolPageShell>
  )
}
