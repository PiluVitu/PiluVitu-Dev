import { useState, type FormEvent } from 'react'
import { parseBRL } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import { todayInTeresina } from '../lib/dates'

export function NovoItemForm({
  debtId,
  onCreated,
}: {
  debtId: string
  onCreated: () => void | Promise<void>
}) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    let centavos: number
    try {
      centavos = parseBRL(valor)
    } catch {
      setErro('valor inválido')
      return
    }
    if (centavos <= 0) {
      setErro('valor inválido')
      return
    }

    setSalvando(true)
    try {
      await api(`/api/debts/${debtId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          description: descricao,
          amount_cents: centavos,
          incurred_on: data || todayInTeresina(),
        }),
      })
      setDescricao('')
      setValor('')
      await onCreated()
    } catch (err: unknown) {
      setErro(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={enviar}>
      <h3>Novo item</h3>
      {erro !== null && <p role="alert">{erro}</p>}

      <label htmlFor="item-descricao">Descrição</label>
      <input
        id="item-descricao"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
      />

      <label htmlFor="item-valor">Valor</label>
      <input
        id="item-valor"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="1.360,00"
      />

      <label htmlFor="item-data">Data</label>
      <input
        id="item-data"
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
      />

      <button type="submit" disabled={salvando}>
        Adicionar item
      </button>
    </form>
  )
}
