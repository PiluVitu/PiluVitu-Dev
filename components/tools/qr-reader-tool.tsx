'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Button } from '@/components/ui/button'
import { CopyButton } from './copy-button'

type State = 'idle' | 'loading' | 'reading' | 'denied' | 'error'

export function QrReaderTool() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const [state, setState] = useState<State>('idle')
  const [result, setResult] = useState('')

  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
    }
  }, [])

  async function start() {
    setState('loading')
    setResult('')
    try {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      const devices = await BrowserMultiFormatReader.listVideoInputDevices()
      const deviceId = devices[0]?.deviceId
      if (!videoRef.current) return
      setState('reading')
      const controls = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result) => {
          if (result) {
            setResult(result.getText())
            stop()
          }
        },
      )
      controlsRef.current = controls
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setState('denied')
      } else {
        setState('error')
      }
    }
  }

  function stop() {
    controlsRef.current?.stop()
    controlsRef.current = null
    setState('idle')
  }

  return (
    <div className="space-y-4">
      <div
        className="bg-muted relative overflow-hidden rounded-xl border"
        style={{ aspectRatio: '4/3' }}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          data-testid="qr-video"
        />
        {state === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Câmera inativa</p>
          </div>
        )}
        {state === 'reading' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="border-primary h-48 w-48 rounded-lg border-4 opacity-60" />
          </div>
        )}
      </div>

      {state === 'denied' && (
        <div
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-3 text-sm"
          data-testid="qr-permission-denied"
        >
          Permissão de câmera negada. Verifique as configurações do navegador e
          tente novamente.
        </div>
      )}

      {state === 'error' && (
        <p className="text-destructive text-sm">Erro ao acessar a câmera.</p>
      )}

      {state === 'loading' ? (
        <Button disabled>Iniciando...</Button>
      ) : state === 'reading' ? (
        <Button variant="outline" onClick={stop} data-testid="qr-stop">
          Parar
        </Button>
      ) : (
        <Button onClick={start} data-testid="qr-start">
          Iniciar câmera
        </Button>
      )}

      {result && (
        <div className="space-y-2" data-testid="qr-result">
          <p className="text-sm font-medium">Resultado:</p>
          <div className="flex items-start gap-2 rounded-md border px-3 py-2">
            <span className="flex-1 font-mono text-sm break-all">{result}</span>
            <CopyButton value={result} />
          </div>
        </div>
      )}
    </div>
  )
}
