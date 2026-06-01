'use client'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { normalizeOptions, drawWinnerIndex } from '@piluvitu/tools/roleta'
import { CameraEntropyCapture } from '@/components/entropy/camera-entropy-capture'
import {
  RouletteWheel,
  type WheelOption,
} from '@/components/entropy/roulette-wheel'
import type { EntropyResult } from '@/hooks/use-camera-entropy'
import { mixEntropyHex } from '@piluvitu/tools/entropy'
import { log } from '@/lib/log'

export function RoletaTool() {
  const [raw, setRaw] = useState('Pizza\nSushi\nHambúrguer\nTapioca')
  const [winnerId, setWinnerId] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)

  const options = useMemo<WheelOption[]>(
    () => normalizeOptions(raw).map((o, i) => ({ id: i, label: o.label })),
    [raw],
  )

  async function spinWith(digestHex: string) {
    if (options.length === 0) return
    const idx = drawWinnerIndex(options.length, digestHex)
    log.info('roleta', 'winner drawn', {
      idx,
      digestPrefix: digestHex.slice(0, 8),
    })
    setWinnerId(options[idx].id as number)
    setSpinning(true)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="roleta-options" className="text-sm font-medium">
          Opções (uma por linha)
        </label>
        <Textarea
          id="roleta-options"
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          data-testid="roleta-options"
        />
      </div>

      <RouletteWheel
        options={options}
        winnerId={winnerId}
        spinning={spinning}
        onSpinEnd={() => setSpinning(false)}
      />

      {winnerId != null && !spinning && (
        <p
          className="text-center text-lg font-semibold"
          data-testid="roleta-winner"
        >
          🎉 {options.find((o) => o.id === winnerId)?.label}
        </p>
      )}

      <CameraEntropyCapture
        label="Girar com entropia da câmera"
        disabled={spinning || options.length === 0}
        onEntropy={(r: EntropyResult) => spinWith(r.digestHex)}
      />

      <Button
        variant="secondary"
        disabled={spinning || options.length === 0}
        onClick={async () => spinWith(await mixEntropyHex())}
        data-testid="roleta-spin-crypto"
      >
        Girar só com aleatório do navegador
      </Button>
    </div>
  )
}
