import { useEffect, useMemo, useState } from 'react'
import { formatBRL, parseBRL, splitInstallments } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import { todayInTeresina } from '../lib/dates'
import type { AccountView } from './accounts'

export function NewEntryPage() {
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [accountId, setAccountId] = useState('')
  const [entrada, setEntrada] = useState(false)
  const [isBusiness, setIsBusiness] = useState(false)
  const [parcelado, setParcelado] = useState(false)
  const [parcelas, setParcelas] = useState(2)

  const [formError, setFormError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    api<AccountView[]>('/api/accounts')
      .then((data) => {
        if (!vivo) return
        setAccounts(data)
        setAccountId((atual) => atual || data[0]?.id || '')
      })
      .catch((e: unknown) => {
        if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  const totalCents = useMemo(() => {
    if (valor.trim() === '') return 0
    try {
      return parseBRL(valor)
    } catch {
      return -1
    }
  }, [valor])

  const previa = useMemo(() => {
    if (!parcelado || totalCents <= 0 || parcelas < 1) return null
    return splitInstallments(totalCents, parcelas)
  }, [parcelado, totalCents, parcelas])

  if (loadError) return <p role="alert">{loadError}</p>

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setOkMsg(null)

    if (totalCents <= 0) {
      setFormError('Valor inválido. Use o formato 1.360,00.')
      return
    }
    if (descricao.trim() === '') {
      setFormError('Descreva o lançamento.')
      return
    }
    if (!accountId) {
      setFormError('Escolha a conta.')
      return
    }

    const purchase_date = data || todayInTeresina()
    const is_business = isBusiness ? 1 : 0

    setEnviando(true)
    try {
      if (parcelado) {
        await api('/api/installment-plans', {
          method: 'POST',
          body: JSON.stringify({
            account_id: accountId,
            description: descricao,
            total_cents: totalCents,
            installments_count: parcelas,
            purchase_date,
            is_business,
          }),
        })
        setOkMsg(`Plano de ${parcelas}× criado.`)
      } else {
        await api('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            account_id: accountId,
            amount_cents: entrada ? totalCents : -totalCents,
            purchase_date,
            description: descricao,
            is_business,
          }),
        })
        setOkMsg('Lançamento gravado.')
      }
      setDescricao('')
      setValor('')
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section>
      <h1>Lançar</h1>
      <form onSubmit={enviar} data-testid="form-lancamento">
        <label>
          Descrição
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
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
            value={data}
            onChange={(e) => setData(e.target.value)}
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

        <label>
          <input
            type="checkbox"
            checked={entrada}
            onChange={(e) => setEntrada(e.target.checked)}
          />
          Entrada
        </label>

        <label>
          <input
            type="checkbox"
            checked={isBusiness}
            onChange={(e) => setIsBusiness(e.target.checked)}
          />
          PJ
        </label>

        <label>
          <input
            type="checkbox"
            checked={parcelado}
            onChange={(e) => setParcelado(e.target.checked)}
          />
          Parcelado
        </label>

        {parcelado ? (
          <>
            <label>
              Parcelas
              <input
                type="number"
                min={1}
                max={360}
                value={parcelas}
                onChange={(e) => setParcelas(Number(e.target.value))}
              />
            </label>
            {previa ? (
              <p data-testid="previa-parcelas">
                {parcelas}× de{' '}
                {previa
                  .slice(0, 3)
                  .map((c) => formatBRL(c))
                  .join(' / ')}
                {previa.length > 3 ? ' …' : ''}
              </p>
            ) : null}
          </>
        ) : null}

        {formError ? <p role="alert">{formError}</p> : null}
        {okMsg ? <p role="status">{okMsg}</p> : null}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Gravar'}
        </button>
      </form>
    </section>
  )
}
