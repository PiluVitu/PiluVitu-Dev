import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { ResumoButtonView } from './resumo-button'

const meta: Meta<typeof ResumoButtonView> = {
  title: 'Admin/Posts/ResumoButton',
  component: ResumoButtonView,
  parameters: { layout: 'padded' },
  args: {
    desabilitado: false,
    tagsAtuais: [],
    onGerar: fn(),
    onUsarSugeridas: fn(),
    onManterAtuais: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[360px]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ResumoButtonView>

export const Ocioso: Story = { args: { estado: { tipo: 'ocioso' } } }

export const Gerando: Story = { args: { estado: { tipo: 'gerando' } } }

export const ErroDeTeto: Story = {
  args: {
    estado: {
      tipo: 'erro',
      mensagem: 'O teto de gasto do resumo neste mês foi atingido.',
    },
  },
}

export const Preenchido: Story = { args: { estado: { tipo: 'preenchido' } } }

export const ConfirmarTrocaDeTags: Story = {
  args: {
    tagsAtuais: ['devops', 'ferramentas'],
    estado: {
      tipo: 'confirmarTags',
      sugestao: {
        tldr: 'Eu mostro como configurar o Husky.',
        metaDescription:
          'Como configurar o Husky com lint-staged num monorepo pnpm, passo a passo.',
        tags: ['git', 'husky', 'lint-staged'],
      },
    },
  },
}

export const SemCorpo: Story = {
  args: { estado: { tipo: 'ocioso' }, desabilitado: true },
}
