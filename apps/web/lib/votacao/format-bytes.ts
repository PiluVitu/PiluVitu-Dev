/**
 * Formata bytes pro tamanho legível mostrado no painel de backups
 * (`components/votacao/admin/backups-panel.tsx`) — extraído do componente
 * pra lib pura testável em Jest, mesmo padrão de `lib/votacao/results.ts`
 * (`analyzeResults`): a UI só chama, a lógica vive aqui.
 */
export function formatBackupSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
