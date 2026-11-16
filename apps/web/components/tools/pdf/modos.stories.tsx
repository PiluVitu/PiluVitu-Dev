import type { Meta, StoryObj } from '@storybook/nextjs'
import { caminhoDoModo } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { ModosDoEditor } from './modos'

const pdf = TOOLS.find(({ slug }) => slug === 'pdf')!

const meta = {
  title: 'Tools/PDF/Modos',
  component: ModosDoEditor,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModosDoEditor>

export default meta
type Story = StoryObj<typeof meta>

export const DoRegistro: Story = {
  args: {
    modos: (pdf.modos ?? []).map((modo) => ({
      ...modo,
      href: caminhoDoModo(pdf.slug, modo.slug),
    })),
  },
}

export const TextoComprido: Story = {
  args: {
    modos: (pdf.modos ?? []).map((modo) => ({
      ...modo,
      description: `${modo.description}, com um texto bem mais comprido para ver a quebra de linha no celular`,
      href: caminhoDoModo(pdf.slug, modo.slug),
    })),
  },
}
