import { useEffect, useMemo, useState } from 'react'
import { formatBRL, parseBRL, sumCents } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import type { AccountView } from './accounts'

export type DebtItemBalanceView = {
  item_id: string
  debt_id: string
  description: string
  amount_cents: number
  allocated_cents: number
  remaining_cents: number
  is_settled: number
}

export type DebtPaymentView = {
  id: string
  debt_id: string
  paid_on: string
  amount_cents: number
  kind: 'cash' | 'offset' | 'forgiven'
  transaction_id: string | null
  notes: string | null
  allocations: Array<{ item_id: string; amount_cents: number }>
}

export type DebtDetailView = {
  debt: {
    id: string
    title: string
    direction: 'i_owe' | 'owed_to_me'
    status: 'open' | 'settled' | 'written_off'
  }
  items: DebtItemBalanceView[]
  payments: DebtPaymentView[]
}

/**
 * Espelho, no cliente, do que os triggers trg_alloc_item_teto e
 * trg_alloc_pagamento_teto barram no D1. Devolve a primeira mensagem de erro,
 * ou null. NAO é a fonte de verdade — só evita ida e volta óbvia.
 */
export function validateAllocations(input: {
  total_cents: number
  items: DebtItemBalanceView[]
  alloc: Record<string, number>
}): string | null {
  const { total_cents, items, alloc } = input

  if (total_cents <= 0) return 'Informe um valor de pagamento maior que zero.'

  for (const item of items) {
    const valor = alloc[item.item_id] ?? 0
    if (valor < 0) return `Alocação negativa em ${item.description}.`
    if (valor > item.remaining_cents) {
      return `${item.description} tem só ${formatBRL(item.remaining_cents)} em aberto — não dá para alocar ${formatBRL(valor)}.`
    }
  }

  const alocado = sumCents(items.map((i) => alloc[i.item_id] ?? 0))
  if (alocado > total_cents) {
    return `A soma das alocações (${formatBRL(alocado)}) passa do valor do pagamento (${formatBRL(total_cents)}).`
  }

  return null
}

function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function DebtDetailPage({ debtId }: { debtId: string }) {
  const [detail, setDetail] = useState<DebtDetailView | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [valor, setValor] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [accountId, setAccountId] = useState('')
  const [allocRaw, setAllocRaw] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function carregar() {
    const [d, contas] = await Promise.all([
      api<DebtDetailView>(`/api/debts/${debtId}`),
      api<AccountView[]>('/api/accounts'),
    ])
    setDetail(d)
    setAccounts(contas)
    setAccountId((atual) => atual || contas[0]?.id || '')
  }

  useEffect(() => {
    carregar().catch((e: unknown) =>
      setLoadError(e instanceof ApiError ? e.message : String(e)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtId])

  const totalCents = useMemo(() => {
    if (valor.trim() === '') return 0
    try {
      return parseBRL(valor)
    } catch {
      return -1
    }
  }, [valor])

  const alloc = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [id, raw] of Object.entries(allocRaw)) {
      if (raw.trim() === '') continue
      try {
        out[id] = parseBRL(raw)
      } catch {
        out[id] = -1
      }
    }
    return out
  }, [allocRaw])

  if (loadError) return <p role="alert">{loadError}</p>
  if (!detail) return <p>Carregando…</p>

  const totalDivida = sumCents(detail.items.map((i) => i.amount_cents))
  const emAberto = sumCents(
    detail.items.map((i) => Math.max(0, i.remaining_cents)),
  )
  const descricaoItem = (id: string) =>
    detail.items.find((i) => i.item_id === id)?.description ?? id

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (totalCents < 0) {
      setFormError('Valor inválido. Use o formato 1.360,00.')
      return
    }

    const erro = validateAllocations({
      total_cents: totalCents,
      items: detail!.items,
      alloc,
    })
    if (erro) {
      setFormError(erro)
      return
    }
    if (!accountId) {
      setFormError('Escolha a conta de onde o dinheiro sai.')
      return
    }

    const allocations = Object.entries(alloc)
      .filter(([, cents]) => cents > 0)
      .map(([item_id, amount_cents]) => ({ item_id, amount_cents }))

    setEnviando(true)
    try {
      await api(`/api/debts/${debtId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          paid_on: paidOn || new Date().toISOString().slice(0, 10),
          amount_cents: totalCents,
          kind: 'cash',
          account_id: accountId,
          description: `Pgto divida — ${detail!.debt.title}`,
          allocations,
        }),
      })
      setValor('')
      setAllocRaw({})
      await carregar()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'over_allocation') {
        // O trigger do D1 abortou e o batch inteiro reverteu: nem pagamento,
        // nem lançamento no caixa, nem alocação parcial ficaram.
        setFormError(
          `O banco recusou: ${err.message}. Nada foi gravado — recarregue a divida.`,
        )
      } else {
        setFormError(err instanceof ApiError ? err.message : String(err))
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section>
      <h1>Dívida · {detail.debt.title}</h1>
      <p>
        {detail.debt.direction === 'i_owe' ? 'devo' : 'me devem'}{' '}
        <strong>{formatBRL(emAberto)}</strong> de {formatBRL(totalDivida)}
      </p>

      <h2>Itens</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>total</th>
            <th>pago</th>
            <th>falta</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((i) => (
            <tr
              key={i.item_id}
              data-testid={`item-${i.item_id}`}
              className={i.is_settled ? 'quitado' : undefined}
            >
              <td>
                {i.description}
                {i.is_settled ? <span aria-label="quitado"> ✓</span> : null}
              </td>
              <td data-testid={`item-${i.item_id}-total`}>
                {formatBRL(i.amount_cents)}
              </td>
              <td data-testid={`item-${i.item_id}-pago`}>
                {formatBRL(i.allocated_cents)}
              </td>
              <td data-testid={`item-${i.item_id}-falta`}>
                {formatBRL(Math.max(0, i.remaining_cents))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Pagamentos</h2>
      <ul>
        {detail.payments.map((p) => (
          <li key={p.id} data-testid={`pagamento-${p.id}`}>
            <span>{dataBR(p.paid_on)}</span>{' '}
            <strong data-testid={`pagamento-${p.id}-total`}>
              {formatBRL(p.amount_cents)}
            </strong>
            <ul>
              {p.allocations.map((a) => (
                <li key={a.item_id} data-testid={`alloc-${p.id}-${a.item_id}`}>
                  {descricaoItem(a.item_id)} · {formatBRL(a.amount_cents)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h2>Novo pagamento</h2>
      <form onSubmit={enviar} data-testid="form-pagamento">
        <label>
          Valor
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="1.360,00"
          />
        </label>
        <label>
          Data
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </label>
        <label>
          Conta
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Dividir entre itens</legend>
          {detail.items.map((i) => (
            <label key={i.item_id}>
              {i.description}
              <input
                value={allocRaw[i.item_id] ?? ''}
                disabled={i.is_settled === 1}
                onChange={(e) =>
                  setAllocRaw((prev) => ({
                    ...prev,
                    [i.item_id]: e.target.value,
                  }))
                }
                placeholder={formatBRL(Math.max(0, i.remaining_cents))}
              />
            </label>
          ))}
        </fieldset>

        {formError ? <p role="alert">{formError}</p> : null}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Registrar pagamento'}
        </button>
      </form>
    </section>
  )
}
