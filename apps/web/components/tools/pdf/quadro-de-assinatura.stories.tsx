import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect } from 'storybook/test'
import type { PontoDoTraco } from '@piluvitu/tools/pdf-regras'
import { CORES } from './objetos'
import { QuadroDeAssinatura } from './quadro-de-assinatura'

// Uma assinatura de exemplo, em unidades do quadro (600 × 200).
const ASSINATURA: PontoDoTraco[][] = [
  [
    [70, 140],
    [90, 80],
    [110, 60],
    [125, 90],
    [120, 140],
    [150, 110],
    [180, 95],
    [205, 130],
    [230, 100],
    [260, 120],
    [300, 90],
  ],
  [
    [320, 130],
    [360, 70],
    [390, 140],
    [420, 90],
    [470, 120],
    [520, 100],
  ],
]

// O quadro só guarda o traço em curso; a story faz o papel do CriarAssinatura e guarda os traços.
function QuadroComTracos({
  inicial,
  cor,
}: {
  inicial: PontoDoTraco[][]
  cor: string
}) {
  const [tracos, setTracos] = useState(inicial)
  return (
    <div className="max-w-xl space-y-2">
      <QuadroDeAssinatura
        tracos={tracos}
        aoTracar={(traco) => setTracos((anteriores) => [...anteriores, traco])}
        cor={cor}
        espessura={4}
        idDaDica="dica-do-quadro"
      />
      <p id="dica-do-quadro" className="text-muted-foreground text-xs">
        Desenhe com o dedo, o mouse ou a caneta. Sem ponteiro, use Digitar o
        nome.
      </p>
    </div>
  )
}

const meta = {
  title: 'Tools/PDF/QuadroDeAssinatura',
  component: QuadroComTracos,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { inicial: [], cor: CORES.preto },
} satisfies Meta<typeof QuadroComTracos>

export default meta
type Story = StoryObj<typeof meta>

export const Vazio: Story = {
  play: async ({ canvas }) => {
    const quadro = canvas.getByRole('img', { name: 'Quadro da assinatura' })
    await expect(quadro).toHaveAccessibleDescription(/Digitar o nome/)
    await expect(quadro).not.toHaveAttribute('tabindex')
  },
}

export const ComTracos: Story = {
  args: { inicial: ASSINATURA, cor: CORES.azul },
}
