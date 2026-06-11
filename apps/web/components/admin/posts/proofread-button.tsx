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
import { wordDiff, extractCorrections } from '@/lib/admin/atelier/word-diff'

interface ProofreadButtonProps {
  body: string
  onApply: (corrected: string) => void
}

export function ProofreadButton({ body, onApply }: ProofreadButtonProps) {
  const [open, setOpen] = useState(false)
  const [corrected, setCorrected] = useState('')
  const [showFull, setShowFull] = useState(false)
  const [careful, setCareful] = useState(false)
  const proofread = useProofread()

  async function run() {
    try {
      const res = await proofread.mutateAsync({ text: body, careful })
      setCorrected(res.corrected)
      setShowFull(false)
      setOpen(true)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const segments = open ? wordDiff(body, corrected) : []
  const corrections = open ? extractCorrections(segments) : []

  return (
    <>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!body.trim() || proofread.isPending}
          onClick={run}
        >
          {proofread.isPending ? 'Corrigindo…' : 'Corrigir texto'}
        </Button>
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={careful}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCareful(e.target.checked)
            }
          />
          Revisão cuidadosa (mais lenta)
        </label>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisão da IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {corrections.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma alteração — o texto já está correto.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground font-mono text-xs">
                  {corrections.length}{' '}
                  {corrections.length === 1 ? 'correção' : 'correções'}
                </p>
                <ul className="max-h-[40vh] space-y-1 overflow-auto">
                  {corrections.map((c, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-2 font-mono text-sm"
                    >
                      {c.before ? (
                        <span className="text-destructive line-through">
                          {c.before}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          (adicionado)
                        </span>
                      )}
                      <span className="text-muted-foreground">→</span>
                      {c.after ? (
                        <span className="text-ok">{c.after}</span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          (removido)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline"
              onClick={() => setShowFull((v) => !v)}
            >
              {showFull ? 'ocultar texto completo' : 'ver texto completo ▾'}
            </button>

            {showFull && (
              <div className="max-h-[40vh] overflow-auto rounded-md border p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
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
            )}
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
