import type { Meta, StoryObj } from '@storybook/nextjs'
import { ProdutoCard } from './produto-card'

const BOTAI = {
  slug: 'botai',
  nome: 'Botaí',
  resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  icone: '/pilulabs/botai/icone-128.png',
  tags: ['Extensão', 'Formulários', 'QA', 'CPF', 'CEP'],
}

const meta = {
  title: 'PiluLabs/ProdutoCard',
  component: ProdutoCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProdutoCard>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = {
  args: { produto: BOTAI, fase: 'em-breve', lojas: [] },
}

export const Disponivel: Story = {
  args: { produto: BOTAI, fase: 'disponivel', lojas: ['chrome', 'firefox'] },
}

export const SemIcone: Story = {
  args: { produto: { ...BOTAI, icone: '' }, fase: 'em-breve', lojas: [] },
}
