import type { ReactNode } from 'react'

export function SidebarCard(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-[var(--radius)] border p-4">
      <h3 className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase">
        {props.title}
      </h3>
      {props.children}
    </section>
  )
}
