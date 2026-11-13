import type { Metadata } from 'next'
import { metadataDaFerramenta } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { QrGeneratorTool } from '@/components/tools/qr-generator-tool'

const tool = TOOLS.find((t) => t.slug === 'qr-generator')!

export const metadata: Metadata = metadataDaFerramenta(tool)

export default function QrGeneratorPage() {
  return (
    <ToolPageShell tool={tool}>
      <QrGeneratorTool />
    </ToolPageShell>
  )
}
