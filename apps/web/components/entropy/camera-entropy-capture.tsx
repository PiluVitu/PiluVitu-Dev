'use client'
import { Button } from '@piluvitu/ui/button'
import { log } from '@/lib/log'
import { faCamera } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  useCameraEntropy,
  type EntropyResult,
} from '@/hooks/use-camera-entropy'

interface Props {
  onEntropy: (result: EntropyResult) => void
  label?: string
  disabled?: boolean
  /** Quando false, renderiza só o botão (o caller cuida do texto de consentimento). */
  consent?: boolean
  className?: string
}

/**
 * Consent + capture UI for camera entropy. Makes the privacy guarantee explicit:
 * the photo is hashed locally and discarded; only the hash is used/sent.
 * Com `consent={false}`, renderiza apenas o botão (o caller provê o callout).
 */
export function CameraEntropyCapture({
  onEntropy,
  label = 'Capturar entropia da câmera',
  disabled,
  consent = true,
  className,
}: Props) {
  const { capture, state } = useCameraEntropy()
  const busy = state === 'capturing'

  const button = (
    <Button
      type="button"
      disabled={disabled || busy}
      className={className}
      onClick={async () => {
        try {
          onEntropy(await capture())
        } catch (err) {
          log.error('entropy', 'capture failed', String(err))
        }
      }}
      data-testid="capture-entropy"
    >
      <FontAwesomeIcon icon={faCamera} className="size-3.5" />
      {busy ? 'Capturando…' : label}
    </Button>
  )

  if (!consent) return button

  return (
    <div className="bg-card border-border space-y-3 rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">
        A foto é processada localmente no seu navegador e{' '}
        <strong className="text-foreground">descartada na hora</strong>; só um
        hash de entropia é usado. Sem câmera/permissão, caímos no gerador seguro
        do navegador.
      </p>
      {button}
    </div>
  )
}
