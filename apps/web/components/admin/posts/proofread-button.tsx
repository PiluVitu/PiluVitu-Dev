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
import { wordDiff, diffParts, applyParts } from '@/lib/admin/atelier/word-diff'

interface ProofreadButtonProps {
  body: string
  onApply: (corrected: string) => void
}

export function ProofreadButton({ body, onApply }: ProofreadButtonProps) {
  const [open, setOpen] = useState(false)
  const [corrected, setCorrected] = useState('')
  const [showFull, setShowFull] = useState(false)
  const [careful, setCareful] = useState(false)
  // Quais mudanças estão aceitas (por índice). Ausente ⇒ aceita por padrão.
  const [accepted, setAccepted] = useState<Record<number, boolean>>({})
  const proofread = useProofread()

  async function run() {
    try {
      const res = await proofread.mutateAsync({ text: body, careful })
      setCorrected(res.corrected)
      setAccepted({})
      setShowFull(false)
      setOpen(true)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const segments = open ? wordDiff(body, corrected) : []
  const parts = open ? diffParts(segments) : []
  const isAcc = (i: number) => accepted[i] ?? true
  const finalText = applyParts(parts, isAcc)

  // Linhas de correção exibíveis, com o índice da mudança (p/ o toggle).
  const rows: { idx: number; before: string; after: string }[] = []
  let ci = 0
  for (const p of parts) {
    if (p.kind === 'change') {
      if (p.before.trim() || p.after.trim()) {
        rows.push({ idx: ci, before: p.before.trim(), after: p.after.trim() })
      }
      ci++
    }
  }
  const acceptedCount = rows.filter((r) => isAcc(r.idx)).length
  const setAll = (val: boolean) =>
    setAccepted(Object.fromEntries(rows.map((r) => [r.idx, val])))

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
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma alteração — o texto já está correto.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground font-mono text-xs">
                    {rows.length} {rows.length === 1 ? 'correção' : 'correções'}{' '}
                    · {acceptedCount} aceita{acceptedCount === 1 ? '' : 's'}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                      onClick={() => setAll(true)}
                    >
                      aceitar todas
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                      onClick={() => setAll(false)}
                    >
                      rejeitar todas
                    </button>
                  </div>
                </div>
                <ul className="max-h-[40vh] space-y-1 overflow-auto">
                  {rows.map((r) => {
                    const on = isAcc(r.idx)
                    return (
                      <li
                        key={r.idx}
                        className="flex flex-wrap items-center gap-2 font-mono text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          aria-label={`aceitar correção: ${r.before || 'adição'} para ${r.after || 'remoção'}`}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setAccepted((a) => ({
                              ...a,
                              [r.idx]: e.target.checked,
                            }))
                          }
                        />
                        <span
                          className={
                            on
                              ? 'text-destructive line-through'
                              : 'text-muted-foreground'
                          }
                        >
                          {r.before || '(adição)'}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span
                          className={
                            on
                              ? 'text-ok'
                              : 'text-muted-foreground line-through'
                          }
                        >
                          {r.after || '(remoção)'}
                        </span>
                      </li>
                    )
                  })}
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
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply(finalText)
                setOpen(false)
                toast.success('Correções aplicadas.')
              }}
            >
              Aplicar ({acceptedCount})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
