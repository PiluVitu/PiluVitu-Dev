import type { Meta, StoryObj } from '@storybook/nextjs'
import { SectionHeader } from './section-header'

const meta: Meta<typeof SectionHeader> = {
  title: 'Home/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof SectionHeader>

export const Carreira: Story = { args: { label: 'Carreira', count: 5 } }
export const Projetos: Story = { args: { label: 'Projetos', count: 1 } }
export const SemContador: Story = { args: { label: 'Artigos' } }
