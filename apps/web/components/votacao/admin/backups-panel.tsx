'use client'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { formatBackupSize } from '@/lib/votacao/format-bytes'
import type { Backup } from '@/lib/votacao/types'

interface Props {
  backups: Backup[]
  isLoading?: boolean
}

/**
 * Painel de backups — SÓ-LEITURA, de propósito. O Worker não tem como
 * disparar um backup (o D1 não tem `VACUUM INTO`; o export real é
 * `wrangler d1 export --remote`, credencial de CONTA, que não pode viver
 * num Worker público — ver `apps/ramielle/CLAUDE.md` § _Backup do D1_ e
 * `docs/superpowers/ROADMAP.md` § 1). Por isso não existe mais botão
 * "disparar backup" aqui: um controle que nunca funciona ensina o dono a
 * ignorar erro. `POST /admin/backup` (ramielle) também não é mais chamável
 * do navegador — trocou de sentido (REGISTRA um backup feito fora, corpo
 * `{file_name,size_bytes,trigger_type}` que só `scripts/backup-d1.sh`
 * possui). O comando abaixo é o único jeito real de gerar um backup novo.
 */
export function BackupsPanel({ backups, isLoading }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Backup é feito fora do painel — rode{' '}
        <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
          make backup-ramielle
        </code>{' '}
        na máquina do dono. A lista abaixo é o histórico registrado (o mais
        recente primeiro).
      </p>
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
                <span className="font-mono">
                  {formatBackupSize(b.SizeBytes)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
