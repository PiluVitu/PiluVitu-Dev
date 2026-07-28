'use client'
import { Button } from '@piluvitu/ui/button'
import { Skeleton } from '@piluvitu/ui/skeleton'
import type { Backup } from '@/lib/votacao/types'

interface Props {
  backups: Backup[]
  isLoading?: boolean
  onBackup?: () => void
  backingUp?: boolean
}

function fmtSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function BackupsPanel({
  backups,
  isLoading,
  onBackup,
  backingUp,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={onBackup}
          disabled={backingUp}
        >
          {backingUp ? 'Fazendo backup…' : 'Fazer backup agora'}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : backups.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum backup ainda.</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {backups.map((b) => (
            <li
              key={b.ID}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span>{new Date(b.CreatedAt).toLocaleString('pt-BR')}</span>
              <span className="text-muted-foreground flex items-center gap-3">
                <span className="text-xs uppercase">{b.TriggerType}</span>
                <span className="font-mono">{fmtSize(b.SizeBytes)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
