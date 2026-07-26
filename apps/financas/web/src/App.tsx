import { useEffect, useState } from 'react'
import { AccountsPage } from './pages/accounts'
import { CommitmentsPage } from './pages/commitments'
import { DebtDetailPage } from './pages/debt-detail'
import { DividasPage } from './pages/DividasPage'
import { NewEntryPage } from './pages/new-entry'

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/contas')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/contas')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

/** Competência do mês corrente em Teresina (UTC−3, sem horário de verão). */
export function competenciaAtual(now: Date = new Date()): string {
  const teresina = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return teresina.toISOString().slice(0, 7)
}

export function App() {
  const hash = useHash()
  const debtId = hash.startsWith('#/dividas/')
    ? hash.slice('#/dividas/'.length)
    : null

  return (
    <>
      <nav>
        <a href="#/contas">Contas</a>
        <a href="#/dividas">Dívidas</a>
        <a href="#/lancar">Lançar</a>
        <a href="#/comprometido">Comprometido</a>
      </nav>
      {debtId ? (
        <DebtDetailPage debtId={debtId} />
      ) : hash === '#/dividas' || hash === '#/dividas/' ? (
        <DividasPage />
      ) : hash.startsWith('#/comprometido') ? (
        <CommitmentsPage from={competenciaAtual()} />
      ) : hash.startsWith('#/lancar') ? (
        <NewEntryPage />
      ) : (
        <AccountsPage />
      )}
    </>
  )
}
