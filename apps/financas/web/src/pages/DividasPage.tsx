import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'

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
          opened_at: abertura || new Date().toISOString().slice(0, 10),
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
    <section>
      <h1>Dívidas</h1>
      {erro !== null && <p role="alert">{erro}</p>}

      <table>
        <thead>
          <tr>
            <th>Dívida</th>
            <th>Pessoa</th>
            <th>Total</th>
            <th>Pago</th>
            <th>Falta</th>
          </tr>
        </thead>
        <tbody>
          {dividas.map((d) => (
            <tr key={d.id}>
              <td>
                <a href={`#/dividas/${d.id}`}>{d.title}</a>
              </td>
              <td>{d.payee_name}</td>
              <td>{formatBRL(d.total_cents)}</td>
              <td>{formatBRL(d.paid_cents)}</td>
              <td>{formatBRL(d.remaining_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={enviar}>
        <h2>Nova dívida</h2>

        <label htmlFor="titulo">Título</label>
        <input
          id="titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />

        <label htmlFor="pessoa">Pessoa</label>
        <select
          id="pessoa"
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

        {payeeId === NOVO && (
          <>
            <label htmlFor="nome-novo">Nome da pessoa</label>
            <input
              id="nome-novo"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
            />
          </>
        )}

        <label htmlFor="abertura">Aberta em</label>
        <input
          id="abertura"
          type="date"
          value={abertura}
          onChange={(e) => setAbertura(e.target.value)}
        />

        <button type="submit" disabled={salvando}>
          Criar dívida
        </button>
      </form>
    </section>
  )
}
