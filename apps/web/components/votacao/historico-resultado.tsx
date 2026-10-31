import Image from 'next/image'
import { cn } from '@/lib/utils'
import { analyzeResults } from '@/lib/votacao/results'
import { participantes, vencedorDoHistorico } from '@/lib/votacao/historico'
import type { HistoricoSessao } from '@/lib/votacao/types'

type Tom = 'win' | 'warn' | 'default'

const FUNDO: Record<Tom, string> = {
  win: 'bg-win/15',
  warn: 'bg-warn/10',
  default: 'bg-muted/40',
}

const BORDA: Record<Tom, string> = {
  win: 'border-win/50',
  warn: 'border-warn/50',
  default: 'border-border',
}

function Roleta({ sessao }: { sessao: HistoricoSessao }) {
  const vencedor = vencedorDoHistorico(sessao)
  return (
    <div className="space-y-6" data-testid="historico-roleta">
      {vencedor ? (
        <div
          data-testid="historico-vencedor"
          className="halloween-card bg-card flex max-w-sm items-center gap-4 rounded-lg border p-4"
        >
          {vencedor.filme.poster_url ? (
            <Image
              src={vencedor.filme.poster_url}
              alt=""
              width={64}
              height={96}
              className="h-24 w-16 rounded object-cover"
            />
          ) : (
            <span aria-hidden="true" className="text-5xl">
              🎃
            </span>
          )}
          <div>
            <p className="text-primary text-xs font-semibold uppercase">
              🏆 Sorteado na roleta
            </p>
            <p className="text-lg font-bold">{vencedor.filme.title}</p>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          A roleta não chegou a ser girada.
        </p>
      )}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-sm font-medium">
          {sessao.movies.length} filmes na roleta
        </h3>
        <ul className="flex flex-wrap gap-2">
          {sessao.movies.map((m) => (
            <li
              key={m.id}
              className={cn(
                'bg-card rounded-full border px-3 py-1 text-xs',
                m.id === vencedor?.filme.id &&
                  'border-primary text-primary font-semibold',
              )}
            >
              {m.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Resultado público de uma sessão encerrada: só contagens, nunca quem votou. */
export function HistoricoResultado({ sessao }: { sessao: HistoricoSessao }) {
  if (sessao.mode === 'roleta') return <Roleta sessao={sessao} />

  const halloween = sessao.theme === 'halloween'
  const vencedor = vencedorDoHistorico(sessao)
  const analise = analyzeResults(
    sessao.movies.map((m) => ({ movie_id: m.id, count: m.votes })),
  )
  const total = sessao.total_votes || 1

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Total de votos:{' '}
        <strong className="text-foreground">{sessao.total_votes}</strong>
        {' · '}
        <strong className="text-foreground">
          {participantes(sessao.total_voters)}
        </strong>
      </p>

      {analise.isTie && (
        <p className="border-warn/40 bg-warn/10 text-warn rounded-lg border px-4 py-3 text-sm">
          Empate entre {analise.topMovieIds.length} filmes com{' '}
          {analise.topCount} voto(s) cada
          {vencedor?.metodo === 'desempate'
            ? ' — resolvido pela roleta de desempate.'
            : '.'}
        </p>
      )}

      <ul className="space-y-2">
        {sessao.movies.map((m) => {
          const pct = ((m.votes / total) * 100).toFixed(0)
          const venceu = vencedor?.filme.id === m.id
          const empatado = analise.isTie && analise.topMovieIds.includes(m.id)
          const tom: Tom = venceu ? 'win' : empatado ? 'warn' : 'default'
          return (
            <li
              key={m.id}
              className={cn(
                'relative overflow-hidden rounded-lg border',
                BORDA[tom],
              )}
            >
              <div
                className={cn('absolute inset-y-0 left-0', FUNDO[tom])}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <div className="relative flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {m.title}
                    {venceu && (
                      <span className="bg-win/15 text-win rounded-full px-2 py-0.5 text-xs font-medium">
                        {vencedor?.metodo === 'desempate'
                          ? '🎲 Vencedor no desempate'
                          : halloween
                            ? '🎃 Vencedor'
                            : '🏆 Vencedor'}
                      </span>
                    )}
                    {empatado && !venceu && (
                      <span className="border-warn/40 text-warn rounded-full border px-2 py-0.5 text-xs font-medium">
                        Empate
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {m.category} · {m.type === 'serie' ? 'série' : 'filme'}
                  </p>
                </div>
                <span className="text-foreground shrink-0 font-mono text-sm">
                  {m.votes}{' '}
                  <span className="text-muted-foreground">({pct}%)</span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
