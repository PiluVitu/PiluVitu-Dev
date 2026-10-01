import type { Meta, StoryObj } from '@storybook/nextjs'
import { StatusProduto } from './status-produto'

const meta = {
  title: 'PiluLabs/StatusProduto',
  component: StatusProduto,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StatusProduto>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { fase: 'em-breve' } }
export const Disponivel: Story = { args: { fase: 'disponivel' } }
