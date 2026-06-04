'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { StatCard } from '@/components/admin/stat-card'
import { GithubLinkBanner } from '@/components/admin/github-link-banner'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useAdminStats } from '@/hooks/admin/use-admin-stats'
import { useGithubLink } from '@/hooks/admin/use-github-link'
import { useSessionsCount } from '@/hooks/admin/use-sessions-count'

export default function AdminDashboardPage() {
  const user = useCurrentUser()
  const stats = useAdminStats()
  const sessions = useSessionsCount()
  const gh = useGithubLink()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ghParam = params.get('gh')
    const reason = params.get('reason')
    if (ghParam === 'linked') toast.success('GitHub conectado')
    if (ghParam === 'error') {
      toast.error(
        reason
          ? `Falha ao conectar o GitHub (${reason})`
          : 'Falha ao conectar o GitHub',
      )
    }
    if (ghParam) {
      params.delete('gh')
      params.delete('reason')
      const qs = params.toString()
      window.history.replaceState({}, '', `/admin${qs ? `?${qs}` : ''}`)
      gh.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = stats.data
  const firstName = user.data?.name?.split(' ')[0] ?? ''

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Bem-vindo de volta, {firstName}</h1>
        <p className="text-muted-foreground">
          Tudo que alimenta o piluvitu.com.br — posts, projetos, carreira e
          votações — em um só lugar.
        </p>
      </header>

      {/* Banner só aparece quando NÃO conectado (CTA de setup); o status/desconectar
          vivem no menu de conta do top bar. */}
      {gh.isSuccess && !gh.data.linked ? (
        <GithubLinkBanner linked={false} />
      ) : null}

      {stats.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-[var(--radius)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Posts"
            value={s?.posts ?? 0}
            hint={
              <>
                <strong className="text-foreground">{s?.published ?? 0}</strong>{' '}
                publicados ·{' '}
                <strong className="text-foreground">{s?.drafts ?? 0}</strong>{' '}
                rascunho
              </>
            }
          />
          <StatCard
            label="Projetos"
            value={s?.projects ?? 0}
            hint="publicados"
          />
          <StatCard
            label="Experiências"
            value={s?.careers ?? 0}
            hint={
              <>
                <strong className="text-foreground">
                  {s?.careersCurrent ?? 0}
                </strong>{' '}
                atuais
              </>
            }
          />
          <StatCard
            label="Sessões de votação"
            value={sessions.isLoading ? '—' : (sessions.data?.total ?? 0)}
            hint={
              <>
                <strong className="text-foreground">
                  {sessions.data?.open ?? 0}
                </strong>{' '}
                aberta ·{' '}
                <strong className="text-foreground">
                  {sessions.data?.closed ?? 0}
                </strong>{' '}
                encerrada
              </>
            }
          />
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase">
          Posts recentes
        </h2>
        <div className="border-border overflow-hidden rounded-[var(--radius)] border">
          {(s?.recentPosts ?? []).map((p) => (
            <div
              key={p.slug}
              className="border-border flex items-center justify-between gap-4 border-b px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.title}</p>
                <p className="text-muted-foreground truncate font-mono text-xs">
                  {p.slug}
                </p>
              </div>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {p.draft ? 'Rascunho' : 'Publicado'} · {p.readingTimeMinutes}{' '}
                min
              </span>
            </div>
          ))}
          {!stats.isLoading && (s?.recentPosts?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-sm">
              Nenhum post ainda.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
