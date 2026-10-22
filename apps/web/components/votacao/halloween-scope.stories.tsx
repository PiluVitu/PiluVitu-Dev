import type { Meta, StoryObj } from '@storybook/nextjs'
import { HalloweenHeading, HalloweenScope } from './halloween-scope'
import { SessionStatusBadge } from './session-status-badge'

const meta: Meta<typeof HalloweenScope> = {
  title: 'Votacao/HalloweenScope',
  component: HalloweenScope,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof HalloweenScope>

export const Pagina: Story = {
  render: () => (
    <HalloweenScope>
      <div className="mx-auto max-w-4xl px-6 py-16">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <HalloweenHeading title="Noite de Halloween" />
          <SessionStatusBadge status="open" />
        </header>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {['A Coisa', 'Hereditário', 'Fragmentado'].map((titulo) => (
            <div
              key={titulo}
              className="halloween-card bg-card border-border rounded-lg border p-6"
            >
              {titulo}
            </div>
          ))}
        </div>
      </div>
    </HalloweenScope>
  ),
}
