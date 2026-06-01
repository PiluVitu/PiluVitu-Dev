import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
