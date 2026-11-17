import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect } from 'storybook/test'
import { DestaqueDoCampo } from './destaque-do-campo'
import { FORMULARIO_DE_TESTE } from './motor-falso'

const A4 = { largura: 595, altura: 842 }

// Uma folha A4 com os campos desenhados em cinza, como o pdf.js os mostra, e o destaque do focado por cima.
function FolhaComCampos({ campo }: { campo: number }) {
  const caixas = FORMULARIO_DE_TESTE.campos
    .find(({ id }) => id === campo)!
    .widgets.filter(({ pagina }) => pagina === 0)
    .map(({ caixa }) => caixa)
  return (
    <div
      className="relative bg-white shadow-sm"
      style={{ width: 357, height: 505 }}
    >
      {FORMULARIO_DE_TESTE.campos.flatMap(({ id, widgets }) =>
        widgets
          .filter(({ pagina }) => pagina === 0)
          .map(({ caixa }, indice) => (
            <div
              key={`${id}-${indice}`}
              className="absolute border border-gray-400 bg-sky-50"
              style={{
                left: `${(caixa.x / A4.largura) * 100}%`,
                top: `${(caixa.y / A4.altura) * 100}%`,
                width: `${(caixa.largura / A4.largura) * 100}%`,
                height: `${(caixa.altura / A4.altura) * 100}%`,
              }}
            />
          )),
      )}
      <DestaqueDoCampo caixas={caixas} tamanho={A4} />
    </div>
  )
}

const meta = {
  title: 'Tools/PDF/DestaqueDoCampo',
  component: FolhaComCampos,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { campo: 0 },
} satisfies Meta<typeof FolhaComCampos>

export default meta
type Story = StoryObj<typeof meta>

export const CampoDeTexto: Story = {
  play: async ({ canvasElement }) => {
    const destaque = canvasElement.querySelector(
      '[data-testid="editar-pdf-destaque"]',
    )!
    await expect(destaque).toHaveAttribute('aria-hidden', 'true')
  },
}

export const CaixaDeMarcar: Story = { args: { campo: 2 } }
