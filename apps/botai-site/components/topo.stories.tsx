import type { Meta, StoryObj } from '@storybook/nextjs'
import { Topo } from './topo'

const meta = {
  title: 'Landing/Topo',
  component: Topo,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Topo>

export default meta
type Story = StoryObj<typeof meta>

export const DaLanding: Story = {
  args: {
    voltar: { href: 'https://piluvitu.com.br/pilulabs', rotulo: 'PiluLabs' },
    ancoras: [
      { href: '#como-usar', rotulo: 'como usar' },
      { href: '#capturas', rotulo: 'capturas' },
    ],
  },
}
export const DaPolitica: Story = {
  args: { voltar: { href: '/', rotulo: 'Botaí' } },
}
