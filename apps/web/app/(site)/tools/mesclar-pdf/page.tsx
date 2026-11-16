import type { Metadata } from 'next'
import { metadataDaFerramenta } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { MesclarPdf } from '@/components/tools/pdf/mesclar'

const tool = TOOLS.find((t) => t.slug === 'mesclar-pdf')!

export const metadata: Metadata = metadataDaFerramenta(tool)

export default function MesclarPdfPage() {
  return (
    <ToolPageShell tool={tool}>
      <MesclarPdf />
    </ToolPageShell>
  )
}
