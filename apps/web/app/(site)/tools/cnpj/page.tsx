import type { Metadata } from 'next'
import { metadataDaFerramenta } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { CnpjTool } from '@/components/tools/cnpj-tool'

const tool = TOOLS.find((t) => t.slug === 'cnpj')!

export const metadata: Metadata = metadataDaFerramenta(tool)

export default function CnpjPage() {
  return (
    <ToolPageShell tool={tool}>
      <CnpjTool />
    </ToolPageShell>
  )
}
