import type { Meta, StoryObj } from '@storybook/nextjs'
import { CabecalhoSecao } from './cabecalho-secao'

const meta = {
  title: 'Landing/CabecalhoSecao',
  component: CabecalhoSecao,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CabecalhoSecao>

export default meta
type Story = StoryObj<typeof meta>

export const ComContagem: Story = {
  args: { id: 'recursos-heading', rotulo: 'O que ele bota', contagem: 5 },
}
export const SemContagem: Story = {
  args: { id: 'uso-heading', rotulo: 'Como usar' },
}
export const Claro: Story = {
  args: { id: 'capturas-heading', rotulo: 'Capturas', contagem: 3 },
  globals: { tema: 'claro' },
}
