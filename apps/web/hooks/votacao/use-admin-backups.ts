'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

/**
 * Só-leitura, de propósito — não existe mais `useCreateBackup`. O Worker
 * não tem como disparar um backup (D1 sem `VACUUM INTO`); `POST
 * /admin/backup` trocou de sentido pra REGISTRAR um backup feito fora
 * (`scripts/backup-d1.sh`), com corpo que só o script possui — ver
 * `components/votacao/admin/backups-panel.tsx` e
 * `docs/superpowers/ROADMAP.md` § 1.
 */
export function useAdminBackups(enabled = true) {
  return useQuery({
    queryKey: ['votacao', 'admin', 'backups'],
    queryFn: () => votacaoApi.adminBackups(),
    enabled,
    staleTime: 30_000,
  })
}
