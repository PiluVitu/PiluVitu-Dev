import { useEffect, useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { signOut, useSession } from './auth-client'
import { Gate } from './Gate'
import { competenciaAtual } from './lib/dates'
import { AccountsPage } from './pages/accounts'
import { CommitmentsPage } from './pages/commitments'
import { ConfigPage } from './pages/config'
import { DebtDetailPage } from './pages/debt-detail'
import { DividasPage } from './pages/DividasPage'
import { HomePage } from './pages/home'
import { ImportarPage } from './pages/importar'
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

function AppShell() {
  const { data: sessao } = useSession()
  const hash = useHash()
  const debtId = hash.startsWith('#/dividas/')
    ? hash.slice('#/dividas/'.length)
    : null

  // `underline`, não `hover:underline`: Tailwind v4 emite `hover:*` dentro de
  // `@media (hover: hover)` — MEDIDO com `hasTouch: true, isMobile: true`
  // (Android real, onde o dono usa o app): `hover:underline` nunca aplica,
  // e o link fica distinguível do texto só por cor (~2:1 de contraste,
  // abaixo do mínimo). A regra apagada de `base-interina.css` era
  // incondicional — isto restaura exatamente esse comportamento.
  const navLinkClassName = 'text-primary text-sm underline underline-offset-4'

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
      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b pb-3">
        <a href="#/" className={navLinkClassName}>
          Início
        </a>
        <a href="#/contas" className={navLinkClassName}>
          Contas
        </a>
        <a href="#/dividas" className={navLinkClassName}>
          Dívidas
        </a>
        <a href="#/lancar" className={navLinkClassName}>
          Lançar
        </a>
        <a href="#/recorrentes" className={navLinkClassName}>
          Recorrentes
        </a>
        <a href="#/reserva" className={navLinkClassName}>
          Reserva
        </a>
        <a href="#/importar" className={navLinkClassName}>
          Importar
        </a>
        <a href="#/comprometido" className={navLinkClassName}>
          Comprometido
        </a>
        <a href="#/configuracoes" className={navLinkClassName}>
          Configurações
        </a>
      </nav>
      {debtId ? (
        <DebtDetailPage debtId={debtId} />
      ) : hash === '#/dividas' || hash === '#/dividas/' ? (
        <DividasPage />
      ) : hash.startsWith('#/comprometido') ? (
        <CommitmentsPage from={competenciaAtual()} />
      ) : hash.startsWith('#/lancar') ? (
        <NewEntryPage />
      ) : hash === '#/recorrentes' || hash === '#/recorrentes/' ? (
        <RecorrentesPage />
      ) : hash === '#/reserva' || hash === '#/reserva/' ? (
        <ReservaPage />
      ) : hash === '#/importar' || hash === '#/importar/' ? (
        <ImportarPage />
      ) : hash === '#/contas' || hash === '#/contas/' ? (
        <AccountsPage />
      ) : hash === '#/configuracoes' || hash === '#/configuracoes/' ? (
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
