import type { Metadata } from 'next'
import { caminhoDaFerramenta, metadataDoModo } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { EditarPdf } from '@/components/tools/pdf/editar'

const tool = TOOLS.find((t) => t.slug === 'pdf')!
const modo = tool.modos!.find((m) => m.slug === 'editar')!

export const metadata: Metadata = metadataDoModo(tool, modo)

export default function EditarPdfPage() {
  return (
    <ToolPageShell
      tool={modo}
      voltar={{ href: caminhoDaFerramenta(tool.slug), rotulo: tool.title }}
      larga
    >
      <EditarPdf />
    </ToolPageShell>
  )
}
