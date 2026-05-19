import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import type { ToolMeta } from '@/lib/tools-registry'

type Props = {
  tool: ToolMeta
  children: React.ReactNode
}

export function ToolPageShell({ tool, children }: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link
        href="/tools"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-2 text-sm transition-colors"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
        Ferramentas
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
          <FontAwesomeIcon icon={tool.icon} className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{tool.title}</h1>
          <p className="text-muted-foreground text-sm">{tool.description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
