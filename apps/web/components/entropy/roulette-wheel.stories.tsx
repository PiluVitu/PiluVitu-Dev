import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { RouletteWheel, type WheelOption } from './roulette-wheel'

const OPTIONS: WheelOption[] = [
  { id: 1, label: 'Duna' },
  { id: 2, label: 'Matrix' },
  { id: 3, label: 'Interestelar' },
  { id: 4, label: 'Blade Runner' },
]

const meta: Meta<typeof RouletteWheel> = {
  title: 'Entropy/RouletteWheel',
  component: RouletteWheel,
}
export default meta
type Story = StoryObj<typeof RouletteWheel>

export const Idle: Story = {
  args: { options: OPTIONS, winnerId: null, spinning: false },
}

/** Com mais de 12 opções (a roleta de Halloween tem ~35), os nomes saem da roda. */
export const ManyOptions: Story = {
  args: {
    options: Array.from({ length: 35 }, (_, i) => ({
      id: i + 1,
      label: `Filme ${i + 1}`,
    })),
    winnerId: null,
    spinning: false,
  },
}

export const Interactive: Story = {
  render: () => {
    const [winner, setWinner] = useState<number | null>(null)
    const [spinning, setSpinning] = useState(false)
    return (
      <div className="space-y-4">
        <RouletteWheel
          options={OPTIONS}
          winnerId={winner}
          spinning={spinning}
          onSpinEnd={() => setSpinning(false)}
        />
        <Button
          onClick={() => {
            setWinner(
              OPTIONS[Math.floor(Math.random() * OPTIONS.length)].id as number,
            )
            setSpinning(true)
          }}
        >
          Girar
        </Button>
      </div>
    )
  },
}
