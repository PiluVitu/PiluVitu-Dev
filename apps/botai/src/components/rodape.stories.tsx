import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/Rodapé',
  component: Rodape,
  args: {
    atalho: 'Ctrl+Shift+Y',
    texto: 'preenche sem abrir',
    comAlterar: true,
    onAlterarAtalho: fn(),
  },
} satisfies Meta<typeof Rodape>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const AtalhoDoMac: Story = { args: { atalho: '⌥⇧P' } }
export const PrimeiroUso: Story = {
  args: { texto: 'preenche sem abrir o popup', comAlterar: false },
}
export const SemAtalho: Story = { args: { atalho: '' } }
