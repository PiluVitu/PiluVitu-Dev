import type { Meta, StoryObj } from '@storybook/nextjs'
import { DUVIDAS } from '@/lib/conteudo'
import { Acordeao } from './acordeao'

const meta = {
  title: 'Landing/Acordeao',
  component: Acordeao,
  parameters: { layout: 'padded' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Acordeao>

export default meta
type Story = StoryObj<typeof meta>

export const DuvidasDoDesign: Story = { args: { itens: DUVIDAS } }
export const UmaPergunta: Story = { args: { itens: DUVIDAS.slice(0, 1) } }
