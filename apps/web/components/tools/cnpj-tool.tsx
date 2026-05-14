'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CopyButton } from './copy-button'
import { gerarCNPJ, validarCNPJ } from '@/lib/tools/cnpj'

export function CnpjTool() {
  const [generated, setGenerated] = useState('')
  const [input, setInput] = useState('')
  const [validResult, setValidResult] = useState<'valid' | 'invalid' | null>(
    null,
  )

  function generate() {
    setGenerated(gerarCNPJ())
  }

  function validate() {
    setValidResult(validarCNPJ(input) ? 'valid' : 'invalid')
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-medium">Gerar CNPJ</h2>
        <div className="flex items-center gap-2">
          <Button onClick={generate} data-testid="cnpj-generate">
            Gerar
          </Button>
          {generated && (
            <>
              <span className="font-mono text-sm" data-testid="cnpj-result">
                {generated}
              </span>
              <CopyButton value={generated} />
            </>
          )}
        </div>
      </section>
      <div className="border-t" />
      <section className="space-y-3">
        <h2 className="font-medium">Validar CNPJ</h2>
        <div className="space-y-2">
          <Label htmlFor="cnpj-input">CNPJ</Label>
          <Input
            id="cnpj-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setValidResult(null)
            }}
            placeholder="00.000.000/0000-00"
            className="max-w-xs font-mono"
            data-testid="cnpj-validate-input"
          />
        </div>
        <Button
          onClick={validate}
          variant="outline"
          data-testid="cnpj-validate-btn"
        >
          Validar
        </Button>
        {validResult === 'valid' && (
          <p className="text-success text-sm" data-testid="cnpj-valid">
            CNPJ válido ✓
          </p>
        )}
        {validResult === 'invalid' && (
          <p className="text-destructive text-sm" data-testid="cnpj-invalid">
            CNPJ inválido ✗
          </p>
        )}
      </section>
    </div>
  )
}
