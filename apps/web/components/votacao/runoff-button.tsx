'use client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useResults } from '@/hooks/votacao/use-session-detail'
import { useCreateRunoff } from '@/hooks/votacao/use-create-runoff'
import { analyzeResults } from '@/lib/votacao/results'
import { errorMessage } from '@/lib/votacao/api-client'

/**
 * RunoffButton renders an admin tie-break action — only when the (closed)
 * session's results are actually tied. Mount it only in the closed branch so
 * `useResults` doesn't fire for open sessions.
 */
export function RunoffButton({ sessionId }: { sessionId: number }) {
  const router = useRouter()
  const { data } = useResults(sessionId)
  const runoff = useCreateRunoff()

  if (!data) return null
  const { isTie, topMovieIds } = analyzeResults(data.results)
  if (!isTie) return null

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        {topMovieIds.length} filmes empatados. Crie uma votação de desempate só
        com eles — os votos recomeçam do zero.
      </p>
      <Button
        disabled={runoff.isPending}
        onClick={() =>
          runoff.mutate(sessionId, {
            onSuccess: (d) => {
              toast.success('Votação de desempate criada')
              router.push(`/votacao/${d.session.ID}`)
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        {runoff.isPending ? 'Criando…' : '🏆 Criar votação de desempate'}
      </Button>
    </div>
  )
}
