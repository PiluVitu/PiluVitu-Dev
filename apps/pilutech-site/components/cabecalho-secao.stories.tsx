import type { Meta, StoryObj } from '@storybook/nextjs'
import { CabecalhoSecao } from './cabecalho-secao'

const meta = {
  title: 'Landing/CabecalhoSecao',
  component: CabecalhoSecao,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CabecalhoSecao>

export default meta
type Story = StoryObj<typeof meta>

export const Claro: Story = {
  args: {
    id: 'servicos-titulo',
    rotulo: 'Serviços',
    contagem: 3,
    titulo: 'Do primeiro protótipo ao servidor em produção.',
  },
  globals: { fundo: 'claro' },
}
export const Escuro: Story = {
  args: {
    id: 'como-funciona-titulo',
    rotulo: 'Como funciona',
    contagem: 4,
    titulo: 'Quatro etapas, com escopo e valor por escrito.',
  },
}
export const Petroleo: Story = {
  args: {
    id: 'planos-titulo',
    rotulo: 'Planos de manutenção',
    contagem: 3,
    titulo: 'Seu aplicativo atualizado, monitorado e no ar.',
    tom: 'petroleo',
  },
  globals: { fundo: 'claro' },
  decorators: [
    (Story) => (
      <div className="bg-primary text-primary-foreground p-8">
        <Story />
      </div>
    ),
  ],
}
