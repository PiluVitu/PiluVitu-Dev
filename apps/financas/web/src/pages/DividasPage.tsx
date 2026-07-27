import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { todayInTeresina } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'

export type DebtListRow = {
  id: string
  title: string
  payee_name: string
  direction: 'i_owe' | 'owed_to_me'
  total_cents: number
  paid_cents: number
  remaining_cents: number
}

export type PayeeOption = { id: string; name: string; kind: string }

const NOVO = '__novo__'

export function DividasPage() {
  const [dividas, setDividas] = useState<DebtListRow[]>([])
  const [payees, setPayees] = useState<PayeeOption[]>([])
  const [payeeId, setPayeeId] = useState(NOVO)
  const [nomeNovo, setNomeNovo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [abertura, setAbertura] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // `vivo` no mesmo formato de debt-detail.tsx:94 (vários setState em
  // sequência): sem a guarda, uma resposta atrasada podia sobrescrever a
  // tela depois que o componente desmontou ou trocou de rota.
  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    const [d, p] = await Promise.all([
      api<DebtListRow[]>('/api/debts?status=open'),
      api<PayeeOption[]>('/api/payees?kind=person'),
    ])
    if (!vivo()) return
    setDividas(d)
    setPayees(p)
  }, [])

  useEffect(() => {
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)

    if (titulo.trim() === '') {
      setErro('Dê um título para a dívida.')
      return
    }
    if (payeeId === NOVO && nomeNovo.trim() === '') {
      setErro('Informe o nome da pessoa.')
      return
    }

    setSalvando(true)
    try {
      let id = payeeId
      if (id === NOVO) {
        const criado = await api<PayeeOption>('/api/payees', {
          method: 'POST',
          body: JSON.stringify({ name: nomeNovo, kind: 'person' }),
        })
        id = criado.id
      }
      await api<{ id: string }>('/api/debts', {
        method: 'POST',
        body: JSON.stringify({
          payee_id: id,
          direction: 'i_owe',
          title: titulo,
          opened_at: abertura || todayInTeresina(),
        }),
      })
      setTitulo('')
      setNomeNovo('')
      await carregar()
    } catch (e: unknown) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dívidas</h1>
      {erro !== null && (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b py-1.5 pr-2 text-left font-medium">
                    Dívida
                  </th>
                  <th className="border-b px-2 py-1.5 text-right font-medium">
                    Pessoa
                  </th>
                  <th className="border-b px-2 py-1.5 text-right font-medium">
                    Total
                  </th>
                  <th className="border-b px-2 py-1.5 text-right font-medium">
                    Pago
                  </th>
                  <th className="border-b py-1.5 pl-2 text-right font-medium">
                    Falta
                  </th>
                </tr>
              </thead>
              <tbody>
                {dividas.map((d) => (
                  <tr key={d.id}>
                    <td className="border-b py-1.5 pr-2 text-left">
                      <a
                        href={`#/dividas/${d.id}`}
                        className="text-primary underline underline-offset-4"
                      >
                        {d.title}
                      </a>
                    </td>
                    <td className="border-b px-2 py-1.5 text-right">
                      {d.payee_name}
                    </td>
                    <td className="border-b px-2 py-1.5 text-right">
                      {formatBRL(d.total_cents)}
                    </td>
                    <td className="border-b px-2 py-1.5 text-right">
                      {formatBRL(d.paid_cents)}
                    </td>
                    <td className="border-b py-1.5 pl-2 text-right font-medium">
                      {formatBRL(d.remaining_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova dívida</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pessoa">Pessoa</Label>
              <select
                id="pessoa"
                className={SELECT_CLASSNAME}
                value={payeeId}
                onChange={(e) => setPayeeId(e.target.value)}
              >
                <option value={NOVO}>— nova pessoa —</option>
                {payees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {payeeId === NOVO && (
              <div className="space-y-1.5">
                <Label htmlFor="nome-novo">Nome da pessoa</Label>
                <Input
                  id="nome-novo"
                  value={nomeNovo}
                  onChange={(e) => setNomeNovo(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="abertura">Aberta em</Label>
              <Input
                id="abertura"
                type="date"
                value={abertura}
                onChange={(e) => setAbertura(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={salvando}>
              Criar dívida
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
