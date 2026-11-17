import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, userEvent, waitFor } from 'storybook/test'
import { DocumentoPdfProvider } from './documento-pdf'
import { EditarPdf } from './editar'
import { criarMotorFalso } from './motor-falso'
import { criarRenderizadorFalso } from './renderizador-falso'

// O motor e o renderizador falsos decidem pelo nome: "-12p" dá 12 páginas, "senha" vem protegido,
// "girado" deita as páginas pares; a página grande e a miniatura falsas são folhas com o número.
const meta = {
  title: 'Tools/PDF/Editar',
  component: EditarPdf,
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
} satisfies Meta<typeof EditarPdf>

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
  parameters: { arquivoInicial: pdf('contrato-girado-12p.pdf') },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByText('Página 1 de 12')).toBeVisible(),
    )
    await expect(
      canvas.getByRole('button', { name: 'Página 1' }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(canvas.getByRole('img', { name: 'Página 1' })).toBeVisible()
  },
}

export const OutraPaginaComZoom: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
  parameters: { arquivoInicial: pdf('contrato-girado-6p.pdf') },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Próxima página' }),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Aumentar o zoom' }),
    )
    await expect(canvas.getByText('Página 2 de 6')).toBeVisible()
    await expect(canvas.getByText('125%')).toBeVisible()
  },
}

export const FalhaAoDesenhar: Story = {
  args: {
    renderizador: criarRenderizadorFalso({ paginasQueFalham: [0] }),
    motor: criarMotorFalso(),
  },
  parameters: { arquivoInicial: pdf('scan-3p.pdf') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Não deu para desenhar a página 1',
    )
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
      'livro-inteiro-800p.pdf tem 800 páginas, mais que as 500 que dá para editar de uma vez.',
    )
  },
}

// Fase 3: as ferramentas. A página falsa é uma folha A4 com o número; os objetos entram pelo
// "Inserir no centro", o mesmo caminho de quem não arrasta.
export const ComObjetos: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
  parameters: { arquivoInicial: pdf('contrato-3p.pdf') },
  play: async ({ canvas }) => {
    await canvas.findByRole('application', { name: 'Objetos da página 1' })
    await userEvent.click(canvas.getByRole('button', { name: 'Retângulo' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Inserir no centro' }),
    )
    await userEvent.keyboard('{Shift>}{ArrowUp}{ArrowUp}{/Shift}')
    await userEvent.click(canvas.getByRole('button', { name: 'Texto' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Inserir no centro' }),
    )
    await userEvent.keyboard('Paulo Victor')
    await expect(
      canvas.getByRole('button', { name: /^Texto 'Paulo Victor'/ }),
    ).toBeVisible()
    // O centro é o da parte da página que aparece na área, que depende da altura da janela.
    await expect(
      canvas.getByRole('button', {
        name: /^Retângulo, em \d+ por \d+, 120 por 80 pontos$/,
      }),
    ).toBeVisible()
  },
}

export const DesenhoLigado: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
  parameters: { arquivoInicial: pdf('contrato-3p.pdf') },
  play: async ({ canvas }) => {
    await canvas.findByRole('application', { name: 'Objetos da página 1' })
    await userEvent.click(canvas.getByRole('button', { name: 'Desenhar' }))
    await expect(canvas.getByText(/^Desenho ligado/)).toBeVisible()
  },
}

export const ApagarDeVerdade: Story = {
  args: { renderizador: criarRenderizadorFalso(), motor: criarMotorFalso() },
  parameters: { arquivoInicial: pdf('extrato-2p.pdf') },
  play: async ({ canvas }) => {
    await canvas.findByRole('application', { name: 'Objetos da página 1' })
    await userEvent.click(canvas.getByRole('button', { name: 'Cobrir' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Inserir no centro' }),
    )
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Apagar de verdade o que está embaixo',
      }),
    )
    await expect(
      canvas.getByRole('button', { name: 'Apagar de verdade nesta página' }),
    ).toHaveFocus()
    await expect(canvas.getByText(/A página vira uma imagem/)).toBeVisible()
  },
}

export const PdfEditadoPronto: Story = {
  args: {
    renderizador: criarRenderizadorFalso(),
    motor: criarMotorFalso({ atraso: 150 }),
  },
  parameters: { arquivoInicial: pdf('contrato-3p.pdf') },
  play: async ({ canvas }) => {
    await canvas.findByRole('application', { name: 'Objetos da página 1' })
    await userEvent.click(canvas.getByRole('button', { name: 'Marca-texto' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Inserir no centro' }),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Gerar PDF editado' }),
    )
    await waitFor(() =>
      expect(
        canvas.getByRole('link', { name: 'Baixar contrato-3p-editado.pdf' }),
      ).toHaveFocus(),
    )
  },
}
