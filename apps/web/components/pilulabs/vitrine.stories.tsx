import type { Meta, StoryObj } from '@storybook/nextjs'
import { Vitrine, type ItemVitrine } from './vitrine'

const BOTAI: ItemVitrine = {
  produto: {
    slug: 'botai',
    tipo: 'extensao',
    nome: 'Botaí',
    resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    icone: '/pilulabs/botai/icone-128.png',
    tags: ['Extensão', 'QA'],
  },
  fase: 'em-breve',
  lojas: [],
}

const meta = {
  title: 'PiluLabs/Vitrine',
  component: Vitrine,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Vitrine>

export default meta
type Story = StoryObj<typeof meta>

export const Vazia: Story = { args: { itens: [] } }

export const ComBotai: Story = { args: { itens: [BOTAI] } }

export const DoisTipos: Story = {
  args: {
    itens: [
      { ...BOTAI, fase: 'disponivel', lojas: ['chrome', 'firefox', 'edge'] },
      {
        produto: {
          slug: 'exemplo-web',
          tipo: 'web',
          nome: 'Exemplo web',
          resumo: 'Um app web de exemplo, só para a story.',
          icone: '',
          tags: ['Web'],
        },
        fase: 'em-breve',
        lojas: [],
      },
    ],
  },
}
