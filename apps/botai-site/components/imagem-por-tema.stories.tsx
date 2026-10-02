import type { Meta, StoryObj } from '@storybook/nextjs'
import { CAPTURAS } from '@/lib/capturas'
import { ImagemPorTema } from './imagem-por-tema'

const meta = {
  title: 'Landing/ImagemPorTema',
  component: ImagemPorTema,
  parameters: { layout: 'padded' },
  args: { variantes: CAPTURAS[0].variantes, sizes: '100vw' },
} satisfies Meta<typeof ImagemPorTema>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
