'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { encodeBase64, decodeBase64 } from '@piluvitu/tools/base64'

export function Base64Tool() {
  const [text, setText] = useState('')
  const [encoded, setEncoded] = useState('')
  const [error, setError] = useState('')

  function encode() {
    setError('')
    try {
      setEncoded(encodeBase64(text))
    } catch {
      setError('Não foi possível codificar')
    }
  }

  function decode() {
    setError('')
    try {
      setText(decodeBase64(encoded))
    } catch {
      setError('Base64 inválido')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="b64-text">Texto</Label>
        <Textarea
          id="b64-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Digite o texto..."
          rows={4}
          data-testid="b64-text"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={encode} variant="default" data-testid="b64-encode">
          Codificar →
        </Button>
        <Button onClick={decode} variant="outline" data-testid="b64-decode">
          ← Decodificar
        </Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="b64-encoded">Base64</Label>
        <Textarea
          id="b64-encoded"
          value={encoded}
          onChange={(e) => setEncoded(e.target.value)}
          placeholder="Base64..."
          rows={4}
          data-testid="b64-encoded"
        />
      </div>
      {error && (
        <p className="text-destructive text-sm" data-testid="b64-error">
          {error}
        </p>
      )}
    </div>
  )
}
