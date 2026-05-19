import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SessionStatusBadge } from './session-status-badge'
import type { VotingSession } from '@/lib/votacao/types'

export function SessionCard({ session }: { session: VotingSession }) {
  return (
    <Link href={`/votacao/${session.ID}`} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle className="text-lg">{session.Title}</CardTitle>
          <SessionStatusBadge status={session.Status} />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            criada em {new Date(session.CreatedAt).toLocaleString('pt-BR')}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
