'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { decodeJWT, type JwtParts } from '@/lib/tools/jwt-decode'

export function JwtTool() {
  const [token, setToken] = useState('')
  const [result, setResult] = useState<JwtParts | null>(null)
  const [error, setError] = useState('')

  function decode() {
    setError('')
    setResult(null)
    try {
      setResult(decodeJWT(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Token inválido')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Apenas decodificação — a assinatura não é verificada.
      </div>
      <div className="space-y-1">
        <Label htmlFor="jwt-input">Token JWT</Label>
        <Textarea
          id="jwt-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          rows={4}
          className="font-mono text-xs"
          data-testid="jwt-input"
        />
      </div>
      <Button onClick={decode} data-testid="jwt-decode">
        Decodificar
      </Button>
      {error && (
        <p className="text-destructive text-sm" data-testid="jwt-error">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-3" data-testid="jwt-result">
          <JwtBlock
            label="Header"
            data={result.header}
            colorClass="border-red-500/40 bg-red-500/5"
          />
          <JwtBlock
            label="Payload"
            data={result.payload}
            colorClass="border-violet-500/40 bg-violet-500/5"
          />
          <div className="border-muted rounded-md border p-3">
            <p className="text-muted-foreground mb-1 text-xs font-medium">
              Signature
            </p>
            <p className="text-muted-foreground font-mono text-xs break-all">
              {result.signature}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function JwtBlock({
  label,
  data,
  colorClass,
}: {
  label: string
  data: Record<string, unknown>
  colorClass: string
}) {
  return (
    <div className={`rounded-md border p-3 ${colorClass}`}>
      <p className="text-muted-foreground mb-2 text-xs font-medium">{label}</p>
      <pre className="overflow-auto text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
