import { useEffect, useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { signOut, useSession } from './auth-client'
import { Gate } from './Gate'
import { competenciaAtual } from './lib/dates'
import { AccountsPage } from './pages/accounts'
import { CategoriasPage } from './pages/categorias'
import { CommitmentsPage } from './pages/commitments'
import { ConfigPage } from './pages/config'
import { DebtDetailPage } from './pages/debt-detail'
import { DividasPage } from './pages/DividasPage'
import { ExtratoPage } from './pages/extrato'
import { FluxoPage } from './pages/fluxo'
import { HomePage } from './pages/home'
import { ImportarPage } from './pages/importar'
import { InsightPage } from './pages/insight'
import { NewEntryPage } from './pages/new-entry'
import { RecorrentesPage } from './pages/recorrentes'
import { ReservaPage } from './pages/reserva'

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

// Única fonte de verdade pra "qual tela o hash corrente resolve" — usada
// TANTO pra decidir o que renderizar QUANTO pra marcar o link ativo no nav.
// Duas cópias da mesma cadeia de precedência (uma pro render, outra pro
// nav) é exatamente o tipo de duplicação que diverge silenciosamente numa
// edição futura — um item novo na cadeia de render que esqueça o irmão no
// nav deixaria a tela certa aparecer com NENHUM link marcado como ativo,
// sem erro nenhum. `#/dividas/:id` (detalhe) resolve pro mesmo `RouteKey`
// de `#/dividas` de propósito — é a mesma "seção" pro nav, mesmo sendo uma
// tela diferente pro render (`debtId` decide isso à parte, abaixo).
type RouteKey =
  | 'home'
  | 'contas'
  | 'categorias'
  | 'dividas'
  | 'extrato'
  | 'comprometido'
  | 'fluxo'
  | 'insight'
  | 'lancar'
  | 'recorrentes'
  | 'reserva'
  | 'importar'
  | 'configuracoes'

export function resolveRoute(hash: string): RouteKey {
  // `startsWith('#/dividas/')` já cobre o caso `hash === '#/dividas/'`
  // (toda string é prefixo de si mesma) — só falta o exato sem barra.
  if (hash.startsWith('#/dividas/') || hash === '#/dividas') return 'dividas'
  if (hash === '#/extrato' || hash === '#/extrato/') return 'extrato'
  if (hash.startsWith('#/comprometido')) return 'comprometido'
  if (hash === '#/fluxo' || hash === '#/fluxo/') return 'fluxo'
  if (hash === '#/insight' || hash === '#/insight/') return 'insight'
  if (hash.startsWith('#/lancar')) return 'lancar'
  if (hash === '#/recorrentes' || hash === '#/recorrentes/')
    return 'recorrentes'
  if (hash === '#/reserva' || hash === '#/reserva/') return 'reserva'
  if (hash === '#/importar' || hash === '#/importar/') return 'importar'
  if (hash === '#/contas' || hash === '#/contas/') return 'contas'
  if (hash === '#/categorias' || hash === '#/categorias/') return 'categorias'
  if (hash === '#/configuracoes' || hash === '#/configuracoes/')
    return 'configuracoes'
  return 'home'
}

const NAV_ITEMS: { href: string; label: string; route: RouteKey }[] = [
  { href: '#/', label: 'Início', route: 'home' },
  { href: '#/contas', label: 'Contas', route: 'contas' },
  { href: '#/dividas', label: 'Dívidas', route: 'dividas' },
  { href: '#/lancar', label: 'Lançar', route: 'lancar' },
  { href: '#/extrato', label: 'Extrato', route: 'extrato' },
  { href: '#/recorrentes', label: 'Recorrentes', route: 'recorrentes' },
  { href: '#/categorias', label: 'Categorias', route: 'categorias' },
  { href: '#/reserva', label: 'Reserva', route: 'reserva' },
  { href: '#/importar', label: 'Importar', route: 'importar' },
  { href: '#/comprometido', label: 'Comprometido', route: 'comprometido' },
  { href: '#/fluxo', label: 'Fluxo de caixa', route: 'fluxo' },
  { href: '#/insight', label: 'Insight', route: 'insight' },
  { href: '#/configuracoes', label: 'Configurações', route: 'configuracoes' },
]

function AppShell() {
  const { data: sessao } = useSession()
  const hash = useHash()
  const debtId = hash.startsWith('#/dividas/')
    ? hash.slice('#/dividas/'.length)
    : null
  const route = resolveRoute(hash)

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">
          {sessao?.user.email}
        </span>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sair
        </Button>
      </header>
      <nav
        aria-label="Navegação principal"
        className="flex flex-wrap gap-1 border-b pb-3"
      >
        {NAV_ITEMS.map((item) => {
          const active = item.route === route
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {item.label}
            </a>
          )
        })}
      </nav>
      {debtId ? (
        <DebtDetailPage debtId={debtId} />
      ) : route === 'dividas' ? (
        <DividasPage />
      ) : route === 'extrato' ? (
        <ExtratoPage />
      ) : route === 'comprometido' ? (
        <CommitmentsPage from={competenciaAtual()} />
      ) : route === 'fluxo' ? (
        <FluxoPage />
      ) : route === 'insight' ? (
        <InsightPage />
      ) : route === 'lancar' ? (
        <NewEntryPage />
      ) : route === 'recorrentes' ? (
        <RecorrentesPage />
      ) : route === 'reserva' ? (
        <ReservaPage />
      ) : route === 'importar' ? (
        <ImportarPage />
      ) : route === 'contas' ? (
        <AccountsPage />
      ) : route === 'categorias' ? (
        <CategoriasPage />
      ) : route === 'configuracoes' ? (
        <ConfigPage />
      ) : (
        <HomePage />
      )}
    </div>
  )
}

export function App() {
  return (
    <Gate>
      <AppShell />
    </Gate>
  )
}
