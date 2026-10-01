import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { CHIPS } from '../lib/grupos'
import { FiltroChips } from './filtro-chips'

const meta = {
  title: 'Popup/Filtro de grupos',
  component: FiltroChips,
  args: { opcoes: CHIPS, ativo: 'tudo', onChange: fn() },
} satisfies Meta<typeof FiltroChips>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const Cartao: Story = { args: { ativo: 'cartao' } }
