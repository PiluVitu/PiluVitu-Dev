import { TOOLS, TOOL_GROUPS } from '@/lib/tools-registry'
import { ToolCard } from '@/components/tools/tool-card'

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Ferramentas</h1>
        <p className="text-muted-foreground mt-1">
          Utilitários para o dia a dia do desenvolvedor.
        </p>
      </div>
      <div className="space-y-8">
        {TOOL_GROUPS.map((group) => {
          const tools = TOOLS.filter((t) => t.group === group.id)
          return (
            <section key={group.id}>
              <h2 className="text-muted-foreground mb-4 text-sm font-semibold tracking-wider uppercase">
                {group.label}
              </h2>
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
