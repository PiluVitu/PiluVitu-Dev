import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, fn, userEvent, waitFor } from 'storybook/test'
import { CriarAssinatura } from './criar-assinatura'

const meta = {
  title: 'Tools/PDF/CriarAssinatura',
  component: CriarAssinatura,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { aoCriar: fn(), aoAnunciar: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CriarAssinatura>

export default meta
type Story = StoryObj<typeof meta>

// Uma assinatura de papel fotografada: tinta azul num fundo quase branco, gerada no navegador.
async function fotoDaAssinatura(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = 160
  const contexto = canvas.getContext('2d')!
  contexto.fillStyle = '#fbfaf7'
  contexto.fillRect(0, 0, 480, 160)
  contexto.strokeStyle = '#1d4ed8'
  contexto.lineWidth = 6
  contexto.beginPath()
  contexto.moveTo(40, 110)
  contexto.bezierCurveTo(120, 10, 180, 150, 260, 70)
  contexto.bezierCurveTo(320, 20, 380, 130, 440, 90)
  contexto.stroke()
  const blob = await new Promise<Blob>((resolver) =>
    canvas.toBlob((gerado) => resolver(gerado!), 'image/png'),
  )
  return new File([blob], 'assinatura-no-papel.png', { type: 'image/png' })
}

export const Desenhar: Story = {
  play: async ({ canvas }) => {
    // O foco vai à opção marcada num efeito, que pode chegar depois de o play começar.
    await waitFor(() =>
      expect(canvas.getByRole('radio', { name: 'Desenhar' })).toHaveFocus(),
    )
    await expect(
      canvas.getByRole('img', { name: 'Quadro da assinatura' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Usar esta assinatura' }),
    ).toHaveAttribute('aria-disabled', 'true')
  },
}

export const EnviarImagem: Story = {
  args: { jeitoInicial: 'enviar' },
  play: async ({ canvasElement, canvas }) => {
    const input = canvasElement.querySelector<HTMLInputElement>(
      '[data-testid="criar-assinatura-input"]',
    )!
    await userEvent.upload(input, await fotoDaAssinatura())
    await waitFor(() =>
      expect(
        canvas.getByText('assinatura-no-papel.png, 480 por 160 pixels.'),
      ).toBeVisible(),
    )
    await expect(
      canvas.getByRole('checkbox', { name: 'Tirar o fundo branco' }),
    ).toBeChecked()
  },
}

export const DigitarONome: Story = {
  args: { jeitoInicial: 'digitar' },
  play: async ({ canvas, args }) => {
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Seu nome' }),
      'Paulo Victor',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Usar esta assinatura' }),
    )
    await expect(args.aoCriar).toHaveBeenCalledWith({
      tipo: 'texto',
      jeito: 'digitada',
      nome: 'Paulo Victor',
      cor: '#000000',
    })
  },
}

export const ImagemRecusada: Story = {
  args: { jeitoInicial: 'enviar' },
  play: async ({ canvasElement, canvas }) => {
    const input = canvasElement.querySelector<HTMLInputElement>(
      '[data-testid="criar-assinatura-input"]',
    )!
    await userEvent.upload(
      input,
      new File(
        [Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)],
        'foto.png',
        {
          type: 'image/png',
        },
      ),
    )
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'foto.png não é PNG nem JPEG. Escolha uma imagem PNG ou JPEG.',
    )
  },
}
