import type { Meta, StoryObj } from '@storybook/nextjs'
import { WhatsappFlutuante } from './whatsapp-flutuante'

const meta = {
  title: 'Landing/WhatsappFlutuante',
  component: WhatsappFlutuante,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof WhatsappFlutuante>

export default meta
type Story = StoryObj<typeof meta>

export const SobreFundoClaro: Story = {}
export const SobreFundoEscuro: Story = { globals: { fundo: 'escuro' } }
