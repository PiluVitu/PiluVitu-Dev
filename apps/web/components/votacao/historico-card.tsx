import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  dataDaSessao,
  participantes,
  vencedorDoHistorico,
} from '@/lib/votacao/historico'
import type { HistoricoSessao } from '@/lib/votacao/types'

const ROTULO = {
  votos: '🏆 Vencedor',
  desempate: '🎲 Vencedor no desempate',
  roleta: '🎃 Sorteado na roleta',
} as const

export function HistoricoCard({
  sessao,
  href,
}: {
  sessao: HistoricoSessao
  href: string
}) {
  const halloween = sessao.theme === 'halloween'
  const vencedor = vencedorDoHistorico(sessao)
  return (
    <Link
      href={href}
      data-halloween={halloween || undefined}
      className={cn(
        'group bg-card border-border hover:bg-accent flex flex-col gap-2 rounded-lg border p-6 transition-colors',
        halloween &&
          'border-orange-500/50 bg-gradient-to-r from-orange-500/15 via-purple-900/20 to-transparent hover:border-orange-400',
      )}
    >
      <span className="text-lg font-semibold">
        {halloween && (
          <span aria-hidden className="mr-2">
            🎃
          </span>
        )}
        {sessao.title}
      </span>
      <span className="text-muted-foreground font-mono text-xs">
        {dataDaSessao(sessao)} · {sessao.movies.length} filmes
        {sessao.mode === 'votacao' &&
          ` · ${participantes(sessao.total_voters)}`}
      </span>
      {vencedor ? (
        <span className="text-sm">
          <span className="text-win font-medium">
            {ROTULO[vencedor.metodo]}:
          </span>{' '}
          {vencedor.filme.title}
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">Sem vencedor</span>
      )}
    </Link>
  )
}
