'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  formatJSON,
  minifyJSON,
  validateJSON,
} from '@piluvitu/tools/json-format'

export function JsonTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [validMsg, setValidMsg] = useState('')

  function clear() {
    setError('')
    setValidMsg('')
  }

  function handleFormat() {
    clear()
    const result = formatJSON(input)
    if (result.ok) setOutput(result.value)
    else {
      const { message, line, column } = result.error
      setError(line ? `${message} (linha ${line}, coluna ${column})` : message)
    }
  }

  function handleMinify() {
    clear()
    const result = minifyJSON(input)
    if (result.ok) setOutput(result.value)
    else {
      const { message, line, column } = result.error
      setError(line ? `${message} (linha ${line}, coluna ${column})` : message)
    }
  }

  function handleValidate() {
    clear()
    const result = validateJSON(input)
    if (result.valid) setValidMsg('JSON válido ✓')
    else {
      const { message, line, column } = result.error ?? {}
      setError(
        line
          ? `${message} (linha ${line}, coluna ${column})`
          : (message ?? 'JSON inválido'),
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="json-input">Entrada</Label>
        <Textarea
          id="json-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='{"chave": "valor"}'
          rows={8}
          className="font-mono text-xs"
          data-testid="json-input"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleFormat} data-testid="json-format">
          Formatar
        </Button>
        <Button
          onClick={handleMinify}
          variant="outline"
          data-testid="json-minify"
        >
          Minificar
        </Button>
        <Button
          onClick={handleValidate}
          variant="outline"
          data-testid="json-validate"
        >
          Validar
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-sm" data-testid="json-error">
          {error}
        </p>
      )}
      {validMsg && (
        <p className="text-success text-sm" data-testid="json-valid">
          {validMsg}
        </p>
      )}
      {output && (
        <div className="space-y-1">
          <Label>Resultado</Label>
          <Textarea
            value={output}
            readOnly
            rows={8}
            className="font-mono text-xs"
            data-testid="json-output"
          />
        </div>
      )}
    </div>
  )
}
