import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { AvisoDePrivacidade, ZonaDeArquivos } from './zona-de-arquivos'

const meta = {
  title: 'Tools/PDF/ZonaDeArquivos',
  component: ZonaDeArquivos,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { aoEscolher: fn() },
} satisfies Meta<typeof ZonaDeArquivos>

export default meta
type Story = StoryObj<typeof meta>

export const VariosArquivos: Story = {}

export const UmArquivo: Story = { args: { multiplos: false } }

export const Desabilitada: Story = { args: { desabilitada: true } }

export const Privacidade: Story = {
  render: () => <AvisoDePrivacidade />,
}
