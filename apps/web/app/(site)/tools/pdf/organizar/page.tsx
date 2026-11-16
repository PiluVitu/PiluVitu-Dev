import type { Metadata } from 'next'
import { caminhoDaFerramenta, metadataDoModo } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { OrganizarPdf } from '@/components/tools/pdf/organizar'

const tool = TOOLS.find((t) => t.slug === 'pdf')!
const modo = tool.modos!.find((m) => m.slug === 'organizar')!

export const metadata: Metadata = metadataDoModo(tool, modo)

export default function OrganizarPdfPage() {
  return (
    <ToolPageShell
      tool={modo}
      voltar={{ href: caminhoDaFerramenta(tool.slug), rotulo: tool.title }}
    >
      <OrganizarPdf />
    </ToolPageShell>
  )
}
