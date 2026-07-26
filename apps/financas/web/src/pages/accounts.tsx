import { useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'

export type AccountView = {
  id: string
  name: string
  scope: 'PJ' | 'PF'
  kind: string
  closing_day: number | null
  due_day: number | null
  balance_cents: number
}

const SCOPES = ['PF', 'PJ'] as const

function dd(n: number): string {
  return String(n).padStart(2, '0')
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<AccountView[]>('/api/accounts')
      .then((data) => {
        if (vivo) setAccounts(data)
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  if (error) return <p role="alert">{error}</p>
  if (!accounts) return <p>Carregando…</p>

  return (
    <section>
      <h1>Contas</h1>
      {SCOPES.map((scope) => {
        const list = accounts.filter((a) => a.scope === scope)
        if (list.length === 0) return null
        return (
          <div key={scope} data-testid={`grupo-${scope}`}>
            <h2>{scope}</h2>
            <table>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.name}
                      {a.kind === 'credit_card' &&
                      a.closing_day !== null &&
                      a.due_day !== null ? (
                        <small data-testid={`fatura-${a.id}`}>
                          {` fecha ${dd(a.closing_day)} · vence ${dd(a.due_day)}`}
                        </small>
                      ) : null}
                    </td>
                    <td data-testid={`saldo-${a.id}`}>
                      {formatBRL(a.balance_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </section>
  )
}
