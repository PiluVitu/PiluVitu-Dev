import type { Metadata } from 'next'
import { caminhoDoModo, metadataDaFerramenta } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { ModosDoEditor } from '@/components/tools/pdf/modos'
import { AvisoDePrivacidade } from '@/components/tools/pdf/zona-de-arquivos'

const tool = TOOLS.find((t) => t.slug === 'pdf')!

export const metadata: Metadata = metadataDaFerramenta(tool)

export default function EditorDePdfPage() {
  return (
    <ToolPageShell tool={tool}>
      <div className="space-y-8">
        <AvisoDePrivacidade />
        <ModosDoEditor
          modos={(tool.modos ?? []).map((modo) => ({
            ...modo,
            href: caminhoDoModo(tool.slug, modo.slug),
          }))}
        />
      </div>
    </ToolPageShell>
  )
}
