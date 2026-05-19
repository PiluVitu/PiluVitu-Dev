'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { encodeQRPng, encodeQRSvg } from '@piluvitu/tools/qr-encode'

export function QrGeneratorTool() {
  const [text, setText] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    try {
      const blob = await encodeQRPng(text)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch {
      setError('Não foi possível gerar o QR code')
    } finally {
      setLoading(false)
    }
  }

  async function downloadPng() {
    if (!text.trim()) return
    const blob = await encodeQRPng(text)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'qrcode.png'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadSvg() {
    if (!text.trim()) return
    const svg = await encodeQRSvg(text)
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'qrcode.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="qr-text">Texto ou URL</Label>
        <Input
          id="qr-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && generate()}
          placeholder="https://..."
          data-testid="qr-gen-input"
        />
      </div>
      <Button
        onClick={generate}
        disabled={loading || !text.trim()}
        data-testid="qr-gen-btn"
      >
        {loading ? 'Gerando...' : 'Gerar QR Code'}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {previewUrl && (
        <div className="space-y-3">
          <div
            className="flex justify-center rounded-xl border p-4"
            data-testid="qr-gen-preview"
          >
            <Image
              src={previewUrl}
              alt="QR Code gerado"
              width={200}
              height={200}
              unoptimized
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadPng}
              data-testid="qr-download-png"
            >
              Download PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadSvg}
              data-testid="qr-download-svg"
            >
              Download SVG
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
