'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CopyButton } from './copy-button'
import { gerarCPF, validarCPF } from '@/lib/tools/cpf'

export function CpfTool() {
  const [generated, setGenerated] = useState('')
  const [input, setInput] = useState('')
  const [validResult, setValidResult] = useState<'valid' | 'invalid' | null>(
    null,
  )

  function generate() {
    setGenerated(gerarCPF())
  }

  function validate() {
    setValidResult(validarCPF(input) ? 'valid' : 'invalid')
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-medium">Gerar CPF</h2>
        <div className="flex items-center gap-2">
          <Button onClick={generate} data-testid="cpf-generate">
            Gerar
          </Button>
          {generated && (
            <>
              <span className="font-mono text-sm" data-testid="cpf-result">
                {generated}
              </span>
              <CopyButton value={generated} />
            </>
          )}
        </div>
      </section>
      <div className="border-t" />
      <section className="space-y-3">
        <h2 className="font-medium">Validar CPF</h2>
        <div className="space-y-2">
          <Label htmlFor="cpf-input">CPF</Label>
          <Input
            id="cpf-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setValidResult(null)
            }}
            placeholder="000.000.000-00"
            className="max-w-xs font-mono"
            data-testid="cpf-validate-input"
          />
        </div>
        <Button
          onClick={validate}
          variant="outline"
          data-testid="cpf-validate-btn"
        >
          Validar
        </Button>
        {validResult === 'valid' && (
          <p className="text-success text-sm" data-testid="cpf-valid">
            CPF válido ✓
          </p>
        )}
        {validResult === 'invalid' && (
          <p className="text-destructive text-sm" data-testid="cpf-invalid">
            CPF inválido ✗
          </p>
        )}
      </section>
    </div>
  )
}
