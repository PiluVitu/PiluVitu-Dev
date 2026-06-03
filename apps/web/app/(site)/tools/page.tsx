import { TOOLS, TOOL_GROUPS } from '@/lib/tools-registry'
import { ToolCard } from '@/components/tools/tool-card'
import { SectionHeader } from '@/components/section-header'
import { PageTopBar } from '@/components/page-top-bar'

export default function ToolsPage() {
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-8 sm:px-8 xl:py-10">
      <PageTopBar backHref="/" backLabel="Paulo Victor" />

      <header className="mt-10 mb-12">
        <h1 className="text-4xl font-bold tracking-tight">Ferramentas</h1>
        <p className="text-muted-foreground mt-2">
          Utilitários para o dia a dia do desenvolvedor.
        </p>
        <p className="mt-4 font-mono text-sm">
          <span className="text-primary">$ ~/tools</span>{' '}
          <span
            className="bg-primary ml-0.5 inline-block h-4 w-2 animate-pulse align-text-bottom"
            aria-hidden
          />
        </p>
      </header>

      <div className="flex flex-col gap-12">
        {TOOL_GROUPS.map((group) => {
          const tools = TOOLS.filter((t) => t.group === group.id)
          return (
            <section key={group.id} className="flex flex-col gap-5">
              <SectionHeader label={group.label} count={tools.length} />
              <div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                data-testid={`group-${group.id}`}
              >
                {tools.map((tool) => (
                  <ToolCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
