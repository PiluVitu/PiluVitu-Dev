import type { Meta, StoryObj } from '@storybook/nextjs'
import { CAPTURAS } from '@/lib/capturas'
import { CapturasAbas } from './capturas-abas'

const meta = {
  title: 'Landing/CapturasAbas',
  component: CapturasAbas,
  parameters: { layout: 'padded' },
  args: { capturas: CAPTURAS, rotuladoPor: 'capturas-heading' },
} satisfies Meta<typeof CapturasAbas>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
