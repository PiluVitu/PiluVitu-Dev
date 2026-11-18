import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'
import type { ToolMeta } from '@/lib/tools-registry'
import { PageTopBar } from '@/components/page-top-bar'

type Props = {
  tool: Pick<ToolMeta, 'icon' | 'title' | 'description'>
  voltar?: { href: string; rotulo: string }
  /** Mais largo a partir de lg, para a ferramenta que põe colunas lado a lado (a Bancada do editor de PDF). */
  larga?: boolean
  children: React.ReactNode
}

export function ToolPageShell({
  tool,
  voltar = { href: '/tools', rotulo: 'Ferramentas' },
  larga = false,
  children,
}: Props) {
  return (
    <div
      className={cn(
        'mx-auto min-h-screen w-full max-w-3xl px-6 py-8 sm:px-8 xl:py-10',
        larga && 'lg:max-w-6xl',
      )}
    >
      <PageTopBar backHref={voltar.href} backLabel={voltar.rotulo} />

      <div className="mt-10 mb-8 flex items-center gap-4">
        <div className="bg-accent-soft text-primary flex size-12 items-center justify-center rounded-xl">
          <FontAwesomeIcon icon={tool.icon} className="size-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight">{tool.title}</h1>
          <p className="text-muted-foreground text-sm">{tool.description}</p>
        </div>
      </div>

      {children}
    </div>
  )
}
