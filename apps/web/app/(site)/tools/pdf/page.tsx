import type { Metadata } from 'next'
import { metadataDaFerramenta } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { EditarPdf } from '@/components/tools/pdf/editar'

const tool = TOOLS.find((t) => t.slug === 'pdf')!

export const metadata: Metadata = metadataDaFerramenta(tool)

export default function EditorDePdfPage() {
  return (
    <ToolPageShell tool={tool} larga>
      <EditarPdf />
    </ToolPageShell>
  )
}
