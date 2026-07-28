'use client'
import { useMemo, useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Textarea } from '@piluvitu/ui/textarea'
import { normalizeOptions, drawWinnerIndex } from '@piluvitu/tools/roleta'
import { CameraEntropyCapture } from '@/components/entropy/camera-entropy-capture'
import {
  RouletteWheel,
  type WheelOption,
} from '@/components/entropy/roulette-wheel'
import type { EntropyResult } from '@/hooks/use-camera-entropy'
import { mixEntropyHex } from '@piluvitu/tools/entropy'
import { log } from '@/lib/log'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

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
    setWinnerId(idx)
    setSpinning(true)
  }

  const disabled = spinning || options.length === 0

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
          onChange={(e) => {
            setRaw(e.target.value)
            setWinnerId(null)
          }}
          data-testid="roleta-options"
        />
      </div>

      <RouletteWheel
        options={options}
        winnerId={winnerId}
        spinning={spinning}
        onSpinEnd={() => setSpinning(false)}
      />

      {winnerId != null && !spinning ? (
        <p
          className="text-center text-lg font-semibold"
          data-testid="roleta-winner"
        >
          🎉 {options.find((o) => o.id === winnerId)?.label}
        </p>
      ) : (
        <p className="text-muted-foreground text-center font-mono text-sm">
          gire a roda para sortear
        </p>
      )}

      <div className="bg-card border-border space-y-4 rounded-lg border p-5">
        <p className="text-muted-foreground flex gap-2 text-sm">
          <FontAwesomeIcon
            icon={faCircleInfo}
            className="text-primary mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <span>
            A foto é processada localmente no seu navegador e{' '}
            <strong className="text-foreground">descartada na hora</strong> — só
            um hash de entropia é usado para semear o sorteio. Sem câmera ou
            permissão, caímos no gerador aleatório seguro do navegador.
          </span>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <CameraEntropyCapture
            consent={false}
            label="Girar com entropia da câmera"
            disabled={disabled}
            onEntropy={(r: EntropyResult) => spinWith(r.digestHex)}
          />
          <Button
            variant="outline"
            disabled={disabled}
            onClick={async () => spinWith(await mixEntropyHex())}
            data-testid="roleta-spin-crypto"
          >
            Girar só com aleatório do navegador
          </Button>
        </div>
      </div>
    </div>
  )
}
