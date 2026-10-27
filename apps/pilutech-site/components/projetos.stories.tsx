import type { Meta, StoryObj } from '@storybook/nextjs'
import { cartoesDosProjetos } from '@/lib/conteudo'
import { CartaoDoProjeto, Projetos } from './projetos'

const meta = {
  title: 'Landing/Projetos',
  component: Projetos,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Projetos>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { faseDoBotai: 'em-breve' } }
export const BotaiPublicado: Story = { args: { faseDoBotai: 'disponivel' } }

const [botai, , apurai, reparai] = cartoesDosProjetos('disponivel')

function UmCartao({ indice }: { indice: number }) {
  const projeto = [botai, apurai, reparai][indice]
  return (
    <div className="bg-background p-6">
      <div className="max-w-[580px]">
        <CartaoDoProjeto projeto={projeto} />
      </div>
    </div>
  )
}

export const CartaoComImagem: StoryObj<typeof UmCartao> = {
  render: () => <UmCartao indice={0} />,
}
export const CartaoSemImagemComLink: StoryObj<typeof UmCartao> = {
  render: () => <UmCartao indice={1} />,
}
export const CartaoSemLink: StoryObj<typeof UmCartao> = {
  render: () => <UmCartao indice={2} />,
}
