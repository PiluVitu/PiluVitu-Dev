import type { Meta, StoryObj } from '@storybook/nextjs'
import { CapturasGaleria } from './capturas-galeria'

function captura(n: number, tema: 'claro' | 'escuro') {
  return {
    arquivo: `0${n}-popup-${tema}.png`,
    src: '/pilulabs/botai/icone-128.png',
    alt: `Captura de tela: popup (tema ${tema})`,
  }
}

const meta = {
  title: 'PiluLabs/CapturasGaleria',
  component: CapturasGaleria,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CapturasGaleria>

export default meta
type Story = StoryObj<typeof meta>

export const Nenhuma: Story = { args: { capturas: [] } }
export const Uma: Story = { args: { capturas: [captura(1, 'escuro')] } }
export const Tres: Story = {
  args: {
    capturas: [captura(1, 'escuro'), captura(2, 'claro'), captura(3, 'escuro')],
  },
}
