import type { Meta, StoryObj } from '@storybook/nextjs'
import { PiluTechMark } from './pilutech-mark'

const meta = {
  title: 'Marca/PiluTechMark',
  component: PiluTechMark,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PiluTechMark>

export default meta
type Story = StoryObj<typeof meta>

export const LockupDaBarra: Story = { args: { tamanho: 30, lockup: true } }
export const LockupDoRodape: Story = { args: { tamanho: 28, lockup: true } }
export const VersaoClara: Story = {
  args: { tamanho: 48, lockup: true },
  globals: { fundo: 'claro' },
}
export const SoOSimbolo: Story = { args: { tamanho: 96 } }
