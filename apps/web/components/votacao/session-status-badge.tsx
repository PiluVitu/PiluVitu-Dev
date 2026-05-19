import { Badge } from '@/components/ui/badge'

export function SessionStatusBadge({ status }: { status: 'open' | 'closed' }) {
  return (
    <Badge variant={status === 'open' ? 'default' : 'secondary'}>
      {status === 'open' ? 'Aberta' : 'Encerrada'}
    </Badge>
  )
}
