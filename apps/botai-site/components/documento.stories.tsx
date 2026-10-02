import type { Meta, StoryObj } from '@storybook/nextjs'
import { Documento } from './documento'

const meta = {
  title: 'Landing/Documento',
  component: Documento,
  parameters: { layout: 'fullscreen' },
  args: {
    rotulo: '~/pilulabs/botai/termos',
    titulo: 'Termos de uso do Botaí',
    vigencia: { iso: '2026-10-02', texto: '2 de outubro de 2026' },
    resumo:
      'o Botaí é grátis, de código aberto (MIT) e serve só para testar software com dados fictícios.',
    children: (
      <>
        <h2>Aceitação</h2>
        <p>
          Estes termos valem para quem instala ou usa a extensão Botaí e para
          quem usa este site.
        </p>
        <h2>O que é proibido</h2>
        <ul>
          <li>se passar por outra pessoa;</li>
          <li>fazer cadastro real em serviços em produção.</li>
        </ul>
        <h3>Uma subseção</h3>
        <dl>
          <dt>Para quê</dt>
          <dd>Entregar as páginas.</dd>
        </dl>
      </>
    ),
  },
} satisfies Meta<typeof Documento>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
