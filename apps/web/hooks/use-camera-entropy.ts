'use client'
import { useCallback, useRef, useState } from 'react'
import { mixEntropyHex } from '@piluvitu/tools/entropy'
import { log } from '@/lib/log'

export type EntropySource = 'camera' | 'crypto-only'
export interface EntropyResult {
  digestHex: string
  source: EntropySource
}
type State = 'idle' | 'capturing' | 'done' | 'error'

const FRAME_COUNT = 3
const FRAME_GAP_MS = 60

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Captures a few webcam frames, hashes their pixels together with crypto.getRandomValues
 * into a 32-byte digest, then discards the image. Only the digest leaves this hook —
 * the photo never does. Falls back to crypto-only when no camera/permission.
 */
export function useCameraEntropy() {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const capture = useCallback(async (): Promise<EntropyResult> => {
    setState('capturing')
    setError(null)
    const frames: Uint8Array[] = []
    let source: EntropySource = 'crypto-only'

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })
      streamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 240
      const ctx = canvas.getContext('2d')
      if (ctx) {
        for (let i = 0; i < FRAME_COUNT; i++) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          frames.push(new Uint8Array(data.buffer.slice(0)))
          if (i < FRAME_COUNT - 1) await wait(FRAME_GAP_MS)
        }
        source = 'camera'
      }
    } catch (err) {
      log.warn('entropy', 'camera unavailable, using crypto-only', String(err))
    } finally {
      stop()
    }

    const digestHex = await mixEntropyHex(...frames)
    log.info('entropy', `captured (${source})`, {
      digestPrefix: digestHex.slice(0, 8),
    })
    setState('done')
    return { digestHex, source }
  }, [stop])

  return { capture, stop, state, error: error ?? undefined }
}
