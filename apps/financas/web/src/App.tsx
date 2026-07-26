import { useEffect, useState } from 'react'
import { AccountsPage } from './pages/accounts'
import { DebtDetailPage } from './pages/debt-detail'

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/contas')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/contas')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
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
      </nav>
      {debtId ? (
        <DebtDetailPage debtId={debtId} />
      ) : hash.startsWith('#/contas') ? (
        <AccountsPage />
      ) : (
        <p>Rota desconhecida: {hash}</p>
      )}
    </>
  )
}
