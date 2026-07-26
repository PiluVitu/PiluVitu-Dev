import { useCallback, useEffect, useState, type FormEvent } from 'react'
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

const KINDS = [
  'checking',
  'savings',
  'credit_card',
  'cash',
  'investment',
  'benefit',
] as const

const KIND_LABELS: Record<(typeof KINDS)[number], string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  cash: 'Dinheiro',
  investment: 'Investimento',
  benefit: 'Benefício',
}

function dd(n: number): string {
  return String(n).padStart(2, '0')
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [scope, setScope] = useState<'PF' | 'PJ'>('PF')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('checking')
  const [closingDay, setClosingDay] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // `vivo` no mesmo formato das outras telas (debt-detail.tsx, DividasPage.tsx):
  // sem a guarda, uma resposta atrasada podia sobrescrever a tela depois que
  // o componente desmontou.
  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    const data = await api<AccountView[]>('/api/accounts')
    if (!vivo()) return
    setAccounts(data)
  }, [])

  useEffect(() => {
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setError(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (nome.trim() === '') {
      setFormError('Dê um nome para a conta.')
      return
    }
    // Espelho, no cliente, do CHECK do schema (kind <> 'credit_card' OR
    // (closing_day IS NOT NULL AND due_day IS NOT NULL)) — sem isto o erro
    // só apareceria depois do POST, como constraint_violation cru do D1.
    if (
      kind === 'credit_card' &&
      (closingDay.trim() === '' || dueDay.trim() === '')
    ) {
      setFormError(
        'Cartão de crédito exige dia de fechamento e de vencimento (1 a 31).',
      )
      return
    }

    setSalvando(true)
    try {
      await api('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: nome,
          scope,
          kind,
          closing_day: kind === 'credit_card' ? Number(closingDay) : undefined,
          due_day: kind === 'credit_card' ? Number(dueDay) : undefined,
        }),
      })
      setNome('')
      setClosingDay('')
      setDueDay('')
      await carregar()
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

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

      <h2>Nova conta</h2>
      <form onSubmit={enviar} data-testid="form-nova-conta">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>

        <label>
          Escopo
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'PF' | 'PJ')}
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          Tipo
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        {kind === 'credit_card' ? (
          <>
            <label>
              Dia de fechamento
              <input
                type="number"
                min={1}
                max={31}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
              />
            </label>
            <label>
              Dia de vencimento
              <input
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </label>
          </>
        ) : null}

        {formError ? <p role="alert">{formError}</p> : null}
        <button type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Criar conta'}
        </button>
      </form>
    </section>
  )
}
