import type { Meta, StoryObj } from '@storybook/nextjs'

const meta: Meta = {
  title: 'Admin/Posts/MdxPreview',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// MdxPreview depends on POST /api/admin/posts/preview (server serialize), which
// Storybook can't run. These stories document the empty/loading/error visuals.
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="border-border rounded-lg border p-5">
        <p className="text-muted-foreground text-sm">Comece a escrever…</p>
      </div>
      <div className="border-border rounded-lg border p-5">
        <p className="text-muted-foreground text-sm">Renderizando…</p>
      </div>
      <div className="border-border rounded-lg border p-5">
        <p className="text-warn text-sm">Falha no preview</p>
      </div>
    </div>
  ),
}
