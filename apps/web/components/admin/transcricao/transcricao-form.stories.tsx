import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { TranscricaoForm } from './transcricao-form'

function audio(nome: string, mb: number): File {
  return new File([new Uint8Array(mb * 1024 * 1024)], nome, {
    type: 'audio/ogg',
  })
}

const meta: Meta<typeof TranscricaoForm> = {
  title: 'Admin/TranscricaoForm',
  component: TranscricaoForm,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onTranscrever: fn() },
}
export default meta
type Story = StoryObj<typeof TranscricaoForm>

export const Vazio: Story = {}

export const ComFila: Story = {
  args: {
    audiosIniciais: [
      audio('reuniao-parte-1.ogg', 2),
      audio('reuniao-parte-2.ogg', 3),
      audio('reuniao-parte-3.ogg', 1),
    ],
  },
}

export const AcimaDoLimite: Story = {
  args: {
    audiosIniciais: [audio('longo-1.m4a', 25), audio('longo-2.m4a', 20)],
  },
}

export const Enviando: Story = {
  args: { ...ComFila.args, pendente: true },
}
