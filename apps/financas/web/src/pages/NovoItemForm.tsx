import { useState, type FormEvent } from 'react'
import { parseBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
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
    <form onSubmit={enviar} className="space-y-4">
      <h3 className="text-sm font-semibold">Novo item</h3>
      {erro !== null && (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="item-descricao">Descrição</Label>
        <Input
          id="item-descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-valor">Valor</Label>
        <Input
          id="item-valor"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="1.360,00"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-data">Data</Label>
        <Input
          id="item-data"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={salvando} size="sm">
        Adicionar item
      </Button>
    </form>
  )
}
