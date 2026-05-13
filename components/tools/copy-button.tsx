'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons'

type Props = {
  value: string
  label?: string
  className?: string
}

export function CopyButton({ value, label = 'Copiar', className }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Copiado!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={className}
      data-testid="copy-button"
    >
      <FontAwesomeIcon
        icon={copied ? faCheck : faCopy}
        className="mr-2 h-3 w-3"
      />
      {copied ? 'Copiado!' : label}
    </Button>
  )
}
