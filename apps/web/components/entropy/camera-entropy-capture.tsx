'use client'
import { Button } from '@/components/ui/button'
import { log } from '@/lib/log'
import {
  useCameraEntropy,
  type EntropyResult,
} from '@/hooks/use-camera-entropy'

interface Props {
  onEntropy: (result: EntropyResult) => void
  label?: string
  disabled?: boolean
}

/**
 * Consent + capture UI for camera entropy. Makes the privacy guarantee explicit:
 * the photo is hashed locally and discarded; only the hash is used/sent.
 */
export function CameraEntropyCapture({
  onEntropy,
  label = 'Capturar entropia da câmera',
  disabled,
}: Props) {
  const { capture, state } = useCameraEntropy()
  const busy = state === 'capturing'

  return (
    <div className="space-y-2 rounded-md border p-4">
      <p className="text-muted-foreground text-xs">
        A foto é processada localmente no seu navegador e{' '}
        <strong>descartada na hora</strong>; só um hash de entropia é usado. Sem
        câmera/permissão, caímos no gerador seguro do navegador.
      </p>
      <Button
        type="button"
        disabled={disabled || busy}
        onClick={async () => {
          try {
            onEntropy(await capture())
          } catch (err) {
            log.error('entropy', 'capture failed', String(err))
          }
        }}
        data-testid="capture-entropy"
      >
        {busy ? 'Capturando…' : label}
      </Button>
    </div>
  )
}
