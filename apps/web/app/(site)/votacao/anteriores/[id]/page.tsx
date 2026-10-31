'use client'
import { use } from 'react'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { PageTopBar } from '@/components/page-top-bar'
import { HistoricoResultado } from '@/components/votacao/historico-resultado'
import { HalloweenScope } from '@/components/votacao/halloween-scope'
import { useBaseDaVotacao } from '@/hooks/votacao/use-base-da-votacao'
import { useHistoricoSessao } from '@/hooks/votacao/use-historico'
import { ApiError, errorMessage } from '@/lib/votacao/api-client'
import { dataDaSessao } from '@/lib/votacao/historico'
import { caminhoNaBase } from '@/lib/votai'

export default function VotacaoAnteriorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const base = useBaseDaVotacao()
  const sessao = useHistoricoSessao(id)
  const halloween = sessao.data?.theme === 'halloween'

  const shell = (children: React.ReactNode) => {
    const pagina = (
      <div className="mx-auto min-h-screen max-w-4xl px-6 py-8 sm:px-8 xl:py-10">
        <PageTopBar
          backHref={caminhoNaBase(base, '/anteriores')}
          backLabel="Votações anteriores"
        />
        <div className="mt-10">{children}</div>
      </div>
    )
    return halloween ? <HalloweenScope>{pagina}</HalloweenScope> : pagina
  }

  // A página é de cliente e responde sempre 200: sem isto, o "index" do layout valeria para
  // o id de uma sessão aberta ou inexistente.
  const naoIndexar = <meta name="robots" content="noindex" />

  if (!Number.isInteger(id) || id <= 0)
    return shell(
      <>
        {naoIndexar}
        <p className="text-destructive">ID inválido.</p>
      </>,
    )

  if (sessao.isLoading)
    return shell(
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>,
    )

  if (!sessao.data) {
    const definitivo =
      sessao.error instanceof ApiError &&
      (sessao.error.status === 404 || sessao.error.status === 400)
    return shell(
      <>
        {definitivo && naoIndexar}
        <p className="text-destructive">
          {sessao.error instanceof ApiError && sessao.error.status === 404
            ? 'Essa votação não existe ou ainda está aberta.'
            : errorMessage(sessao.error)}
        </p>
      </>,
    )
  }

  const s = sessao.data
  return shell(
    <div className="space-y-8">
      <header>
        {halloween && (
          <p className="text-primary font-mono text-xs tracking-[0.3em] uppercase">
            🎃 Sessão de Halloween
          </p>
        )}
        <h1
          className={
            halloween
              ? 'halloween-title mt-2 text-4xl font-bold tracking-tight sm:text-5xl'
              : 'text-4xl font-bold tracking-tight'
          }
        >
          {s.title}
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-xs">
          encerrada em {dataDaSessao(s)}
        </p>
      </header>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">
          {s.mode === 'roleta'
            ? 'O filme da noite'
            : halloween
              ? 'O veredito da noite'
              : 'Resultado'}
        </h2>
        <HistoricoResultado sessao={s} />
      </section>
    </div>,
  )
}
