'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProofread } from '@/hooks/admin/atelier/use-proofread'
import { errorMessage } from '@/lib/votacao/api-client'
import { wordDiff } from '@/lib/admin/atelier/word-diff'

interface ProofreadButtonProps {
  body: string
  onApply: (corrected: string) => void
}

export function ProofreadButton({ body, onApply }: ProofreadButtonProps) {
  const [open, setOpen] = useState(false)
  const [corrected, setCorrected] = useState('')
  const proofread = useProofread()

  async function run() {
    try {
      const res = await proofread.mutateAsync(body)
      setCorrected(res.corrected)
      setOpen(true)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const segments = open ? wordDiff(body, corrected) : []

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!body.trim() || proofread.isPending}
        onClick={run}
      >
        {proofread.isPending ? 'Corrigindo…' : 'Corrigir texto'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisão da IA</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded-md border p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
            {segments.map((s, i) => {
              if (s.type === 'equal') return <span key={i}>{s.value}</span>
              if (s.type === 'add')
                return (
                  <span key={i} className="bg-ok/20 text-ok rounded">
                    {s.value}
                  </span>
                )
              return (
                <span
                  key={i}
                  className="bg-destructive/20 text-destructive rounded line-through"
                >
                  {s.value}
                </span>
              )
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Rejeitar
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply(corrected)
                setOpen(false)
                toast.success('Texto corrigido aplicado.')
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
