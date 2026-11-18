import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect } from 'storybook/test'
import { FolhaEmBranco } from './folha-em-branco'

const A4 = { largura: 595.28, altura: 841.89 }

const meta = {
  title: 'Tools/PDF/FolhaEmBranco',
  component: FolhaEmBranco,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="bg-muted flex size-16 items-center justify-center rounded-md">
        <Story />
      </div>
    ),
  ],
  args: { tamanho: A4, giro: 0, className: 'size-[85%]' },
} satisfies Meta<typeof FolhaEmBranco>

export default meta
type Story = StoryObj<typeof meta>

export const A4DePe: Story = {
  play: async ({ canvasElement }) => {
    const folha = canvasElement.querySelector('svg')!
    await expect(folha.getAttribute('viewBox')).toBe('0 0 595.28 841.89')
  },
}

export const A4Deitada: Story = {
  args: { tamanho: { largura: 841.89, altura: 595.28 } },
}

// O giro deita a folha de pé: a miniatura mostra a página como ela sai no PDF.
export const GiradaNoventaGraus: Story = {
  args: { giro: 90 },
  play: async ({ canvasElement }) => {
    const folha = canvasElement.querySelector('svg')!
    await expect(folha.getAttribute('viewBox')).toBe('0 0 841.89 595.28')
  },
}
