import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, userEvent, waitFor } from 'storybook/test'
import { DocumentoPdfProvider } from './documento-pdf'
import { criarMotorFalso } from './motor-falso'
import { OrganizarPdf } from './organizar'
import { criarRenderizadorFalso } from './renderizador-falso'

// O motor e o renderizador falsos decidem pelo nome: "-12p" dá 12 páginas, "senha" vem protegido,
// "girado" põe /Rotate 90 nas páginas pares; a miniatura falsa é uma folha com o número.
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

export const Vazio: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
}

export const ComPaginas: Story = {
  args: {
    renderizador: criarRenderizadorFalso({ atraso: 120 }),
    motor: criarMotorFalso({ atraso: 200 }),
  },
  parameters: { arquivoInicial: pdf('mesclado-girado-12p.pdf') },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(
        canvas.getByText('mesclado-girado-12p.pdf · 12 páginas'),
      ).toBeVisible(),
    )
    await expect(canvas.getByRole('toolbar')).toHaveAccessibleName(
      'Ações nas páginas selecionadas',
    )
    await expect(canvas.getAllByRole('listitem').length).toBeGreaterThan(11)
  },
}

export const ComSelecao: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
  parameters: { arquivoInicial: pdf('contrato-6p.pdf') },
  play: async ({ canvas }) => {
    const segunda = await canvas.findByRole('checkbox', {
      name: 'Selecionar página 2',
    })
    await userEvent.click(segunda)
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Selecionar página 4' }),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Girar à direita' }),
    )
    await expect(canvas.getByText('2 páginas selecionadas')).toBeVisible()
    await expect(canvas.getAllByText('girada 90°')).toHaveLength(2)
  },
}

export const Pronto: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
  parameters: { arquivoInicial: pdf('contrato-4p.pdf') },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Apagar a página 3' }),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Gerar PDF organizado' }),
    )
    await expect(
      await canvas.findByRole('link', {
        name: 'Baixar contrato-4p-organizado.pdf',
      }),
    ).toHaveFocus()
  },
}

export const Protegido: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
  parameters: { arquivoInicial: pdf('extrato-senha.pdf') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Não deu para abrir extrato-senha.pdf. Está protegido por senha',
    )
  },
}

export const AcimaDoTeto: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
  parameters: { arquivoInicial: pdf('livro-inteiro-800p.pdf') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'livro-inteiro-800p.pdf tem 800 páginas, mais que as 500 que dá para organizar de uma vez.',
    )
  },
}
