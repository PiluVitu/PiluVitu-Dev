import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, userEvent, waitFor } from 'storybook/test'
import { MesclarPdf } from './mesclar'
import { criarMotorFalso } from './motor-falso'

// O motor falso decide pelo nome: "-3p" dá 3 páginas, "senha" vem protegido, "quebrado" vem corrompido.
const meta = {
  title: 'Tools/PDF/Mesclar',
  component: MesclarPdf,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MesclarPdf>

export default meta
type Story = StoryObj<typeof meta>

const pdf = (nome: string, bytes = 240_000) =>
  new File([new Uint8Array(bytes)], nome, { type: 'application/pdf' })

async function escolher(canvasElement: HTMLElement, arquivos: File[]) {
  const input = canvasElement.querySelector<HTMLInputElement>(
    '[data-testid="pdf-input"]',
  )!
  await userEvent.upload(input, arquivos)
}

export const Vazia: Story = {
  args: { motor: criarMotorFalso() },
}

export const ComArquivos: Story = {
  args: { motor: criarMotorFalso({ atraso: 300 }) },
  play: async ({ canvas, canvasElement }) => {
    await escolher(canvasElement, [
      pdf('contrato-3p.pdf'),
      pdf('anexo-relatorio-anual-com-nome-bem-comprido-12p.pdf', 4_800_000),
      pdf('recibo-1p.pdf', 90_000),
    ])
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Mesclar PDFs' }),
      ).toBeEnabled(),
    )
  },
}

export const ComErros: Story = {
  args: { motor: criarMotorFalso() },
  play: async ({ canvas, canvasElement }) => {
    await escolher(canvasElement, [
      pdf('contrato-3p.pdf'),
      pdf('extrato-senha.pdf'),
      pdf('scan-quebrado.pdf'),
    ])
    await waitFor(() =>
      expect(
        canvas.getByText('Remova os arquivos com erro para mesclar.'),
      ).toBeVisible(),
    )
  },
}

export const Mesclando: Story = {
  args: { motor: criarMotorFalso({ atraso: 200, mesclagem: 'nunca' }) },
  play: async ({ canvas, canvasElement }) => {
    await escolher(canvasElement, [pdf('a-2p.pdf'), pdf('b-5p.pdf')])
    const mesclar = canvas.getByRole('button', { name: 'Mesclar PDFs' })
    await waitFor(() => expect(mesclar).toBeEnabled())
    await userEvent.click(mesclar)
    await expect(
      await canvas.findByRole('progressbar', {
        name: 'Progresso da mesclagem',
      }),
    ).toBeVisible()
  },
}

export const Pronto: Story = {
  args: { motor: criarMotorFalso() },
  play: async ({ canvas, canvasElement }) => {
    await escolher(canvasElement, [pdf('a-2p.pdf'), pdf('b-5p.pdf')])
    const mesclar = canvas.getByRole('button', { name: 'Mesclar PDFs' })
    await waitFor(() => expect(mesclar).toBeEnabled())
    await userEvent.click(mesclar)
    await expect(
      await canvas.findByRole('link', { name: 'Baixar mesclado.pdf' }),
    ).toHaveFocus()
  },
}

export const FalhaNaMesclagem: Story = {
  args: {
    motor: criarMotorFalso({ mesclagem: { motivo: 'protegido', indice: 0 } }),
  },
  play: async ({ canvas, canvasElement }) => {
    await escolher(canvasElement, [pdf('a-2p.pdf'), pdf('b-5p.pdf')])
    const mesclar = canvas.getByRole('button', { name: 'Mesclar PDFs' })
    await waitFor(() => expect(mesclar).toBeEnabled())
    await userEvent.click(mesclar)
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Não deu para mesclar: a-2p.pdf.',
    )
  },
}
