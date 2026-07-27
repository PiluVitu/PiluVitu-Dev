import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
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

// Sem componente `Select` em @piluvitu/ui (14 componentes hoje, nenhum é
// select) — classes copiadas à mão das de `Input` (mesmo padrão já usado em
// `blocos/BlocoCategorias.tsx` pro `<input type="month">`), sem as variantes
// `file:*` (irrelevantes pra `<select>`).
const SELECT_CLASSNAME =
  'border-input focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50'

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
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>

      <div className="space-y-4">
        {SCOPES.map((scope) => {
          const list = accounts.filter((a) => a.scope === scope)
          if (list.length === 0) return null
          return (
            <Card key={scope} data-testid={`grupo-${scope}`}>
              <CardHeader>
                <CardTitle className="text-base">{scope}</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id}>
                        <td className="border-b py-1.5 pr-2 text-left">
                          {a.name}
                          {a.kind === 'credit_card' &&
                          a.closing_day !== null &&
                          a.due_day !== null ? (
                            <small
                              data-testid={`fatura-${a.id}`}
                              className="text-muted-foreground block text-xs"
                            >
                              {` fecha ${dd(a.closing_day)} · vence ${dd(a.due_day)}`}
                            </small>
                          ) : null}
                        </td>
                        <td
                          data-testid={`saldo-${a.id}`}
                          className="border-b py-1.5 text-right font-medium"
                        >
                          {formatBRL(a.balance_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova conta</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-nova-conta"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="conta-nome">Nome</Label>
              <Input
                id="conta-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="conta-escopo">Escopo</Label>
              <select
                id="conta-escopo"
                className={SELECT_CLASSNAME}
                value={scope}
                onChange={(e) => setScope(e.target.value as 'PF' | 'PJ')}
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="conta-tipo">Tipo</Label>
              <select
                id="conta-tipo"
                className={SELECT_CLASSNAME}
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as (typeof KINDS)[number])
                }
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            {kind === 'credit_card' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="conta-fechamento">Dia de fechamento</Label>
                  <Input
                    id="conta-fechamento"
                    type="number"
                    min={1}
                    max={31}
                    value={closingDay}
                    onChange={(e) => setClosingDay(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="conta-vencimento">Dia de vencimento</Label>
                  <Input
                    id="conta-vencimento"
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Criar conta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
