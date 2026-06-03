import type { Meta, StoryObj } from '@storybook/nextjs'

const meta: Meta = {
  title: 'Design System/Tokens',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`border-border h-16 w-full rounded-lg border ${className}`}
      />
      <span className="text-muted-foreground font-mono text-xs">{label}</span>
    </div>
  )
}

const colors: Array<{ label: string; className: string }> = [
  { label: 'background', className: 'bg-background' },
  { label: 'foreground', className: 'bg-foreground' },
  { label: 'card', className: 'bg-card' },
  { label: 'secondary', className: 'bg-secondary' },
  { label: 'muted', className: 'bg-muted' },
  { label: 'accent (hover)', className: 'bg-accent' },
  { label: 'primary', className: 'bg-primary' },
  { label: 'destructive', className: 'bg-destructive' },
  { label: 'ok', className: 'bg-ok' },
  { label: 'warn', className: 'bg-warn' },
  { label: 'win', className: 'bg-win' },
  { label: 'accent-soft', className: 'bg-accent-soft' },
]

export const Colors: Story = {
  render: () => (
    <div className="bg-background p-8">
      <h2 className="text-foreground mb-4 text-lg font-semibold">Cores</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {colors.map((c) => (
          <Swatch key={c.label} label={c.label} className={c.className} />
        ))}
      </div>
    </div>
  ),
}

export const Typography: Story = {
  render: () => (
    <div className="bg-background text-foreground space-y-4 p-8">
      <p className="font-sans text-3xl font-bold">
        Plus Jakarta Sans — Display
      </p>
      <p className="font-sans text-base">
        Plus Jakarta Sans — corpo de leitura confortável.
      </p>
      <p className="text-muted-foreground font-mono text-sm">
        JetBrains Mono — labels · metadados · 2026-06-02
      </p>
    </div>
  ),
}

export const ShapeAndShadow: Story = {
  render: () => (
    <div className="bg-background flex flex-wrap items-end gap-6 p-8">
      <div className="bg-card text-card-foreground shadow-ds flex h-32 w-48 items-center justify-center rounded-lg">
        rounded-lg (18px) + shadow-ds
      </div>
      <span className="rounded-pill bg-primary text-primary-foreground px-4 py-1 text-sm">
        rounded-pill
      </span>
    </div>
  ),
}
