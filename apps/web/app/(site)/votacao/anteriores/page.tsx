'use client'
import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { PageTopBar } from '@/components/page-top-bar'
import { HistoricoCard } from '@/components/votacao/historico-card'
import { useBaseDaVotacao } from '@/hooks/votacao/use-base-da-votacao'
import { useHistorico } from '@/hooks/votacao/use-historico'
import { errorMessage } from '@/lib/votacao/api-client'
import { caminhoNaBase } from '@/lib/votai'

export default function VotacoesAnterioresPage() {
  const [pagina, setPagina] = useState(1)
  const historico = useHistorico(pagina)
  const base = useBaseDaVotacao()
  const dados = historico.data

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-8 sm:px-8 xl:py-10">
      <PageTopBar backHref={caminhoNaBase(base)} backLabel="Votaí" />

      <header className="mt-10 mb-10">
        <h1 className="text-4xl font-bold tracking-tight">
          Votações anteriores
        </h1>
        <p className="text-muted-foreground mt-2">
          As noites já encerradas: os filmes, os votos de cada um e o vencedor.
        </p>
      </header>

      <section className="space-y-4" aria-busy={historico.isFetching}>
        {historico.isLoading && (
          <div className="grid gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}
        {historico.error && (
          <p className="text-destructive text-sm">
            {errorMessage(historico.error)}
          </p>
        )}
        {dados?.sessions.length === 0 && (
          <p className="text-muted-foreground">
            Nenhuma votação encerrada ainda.
          </p>
        )}
        <div className="grid gap-3">
          {dados?.sessions.map((s) => (
            <HistoricoCard
              key={s.id}
              sessao={s}
              href={caminhoNaBase(base, `/anteriores/${s.id}`)}
            />
          ))}
        </div>

        {dados && (dados.page > 1 || dados.has_more) && (
          <nav
            aria-label="Páginas do histórico"
            className="flex items-center justify-between gap-4 pt-4"
          >
            <Button
              variant="outline"
              disabled={pagina <= 1 || historico.isFetching}
              onClick={() => setPagina((p) => p - 1)}
            >
              Mais recentes
            </Button>
            <span className="text-muted-foreground font-mono text-xs">
              página {dados.page} de{' '}
              {Math.max(1, Math.ceil(dados.total / dados.page_size))}
            </span>
            <Button
              variant="outline"
              disabled={!dados.has_more || historico.isFetching}
              onClick={() => setPagina((p) => p + 1)}
            >
              Mais antigas
            </Button>
          </nav>
        )}
      </section>
    </div>
  )
}
