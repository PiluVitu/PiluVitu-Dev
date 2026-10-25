import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, fn, userEvent } from 'storybook/test'
import { PasskeysPanel } from './passkeys-panel'

const meta: Meta<typeof PasskeysPanel> = {
  title: 'Admin/PasskeysPanel',
  component: PasskeysPanel,
  args: {
    suportado: true,
    carregando: false,
    erro: null,
    passkeys: [],
    cadastrando: false,
    removendoId: null,
    onCadastrar: fn(),
    onRemover: fn(),
    onTentarDeNovo: fn(),
  },
}
export default meta
type Story = StoryObj<typeof PasskeysPanel>

const lista = [
  {
    id: 'pk-1',
    name: 'MacBook',
    createdAt: '2026-10-20T15:00:00.000Z',
    deviceType: 'multiDevice',
    backedUp: true,
  },
  { id: 'pk-2', name: 'iPhone', createdAt: '2026-10-22T09:30:00.000Z' },
]

export const Vazio: Story = {}

export const Lista: Story = { args: { passkeys: lista } }

export const Carregando: Story = { args: { carregando: true } }

export const Erro: Story = {
  args: { erro: 'Sua sessão expirou. Entre com o Google de novo.' },
}

export const SemSuporte: Story = {
  args: { suportado: false, passkeys: lista },
}

export const Cadastrando: Story = { args: { cadastrando: true } }

export const Removendo: Story = {
  args: { passkeys: lista, removendoId: 'pk-1' },
}

export const CadastrarComNome: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByRole('textbox'), 'iPad')
    await userEvent.click(
      canvas.getByRole('button', { name: /cadastrar passkey/i }),
    )
    await expect(args.onCadastrar).toHaveBeenCalledWith('iPad')
  },
}
