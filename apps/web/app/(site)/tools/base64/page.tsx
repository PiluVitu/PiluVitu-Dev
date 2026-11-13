import type { Metadata } from 'next'
import { metadataDaFerramenta } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { Base64Tool } from '@/components/tools/base64-tool'

const tool = TOOLS.find((t) => t.slug === 'base64')!

export const metadata: Metadata = metadataDaFerramenta(tool)

export default function Base64Page() {
  return (
    <ToolPageShell tool={tool}>
      <Base64Tool />
    </ToolPageShell>
  )
}
