import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, waitFor } from 'storybook/test'
import { DocumentoPdfProvider } from './documento-pdf'
import { OrganizarPdf } from './organizar'
import { criarRenderizadorFalso } from './renderizador-falso'

// Esqueleto do modo organizar. O renderizador falso decide pelo nome: "-12p" dá 12 páginas, "senha" vem protegido.
const meta = {
  title: 'Tools/PDF/Organizar',
  component: OrganizarPdf,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story, { parameters }) => (
      <DocumentoPdfProvider arquivoInicial={parameters.arquivoInicial ?? null}>
        <div className="max-w-3xl">
          <Story />
        </div>
      </DocumentoPdfProvider>
    ),
  ],
} satisfies Meta<typeof OrganizarPdf>

export default meta
type Story = StoryObj<typeof meta>

const pdf = (nome: string) =>
  new File([new Uint8Array(240_000)], nome, { type: 'application/pdf' })

export const SemDocumento: Story = {
  args: { renderizador: criarRenderizadorFalso() },
}

export const ChegandoDoMesclar: Story = {
  args: { renderizador: criarRenderizadorFalso({ atraso: 300 }) },
  parameters: { arquivoInicial: pdf('mesclado-12p.pdf') },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByText('mesclado-12p.pdf · 12 páginas')).toBeVisible(),
    )
  },
}

export const Protegido: Story = {
  args: { renderizador: criarRenderizadorFalso() },
  parameters: { arquivoInicial: pdf('extrato-senha.pdf') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Não deu para abrir extrato-senha.pdf.',
    )
  },
}
