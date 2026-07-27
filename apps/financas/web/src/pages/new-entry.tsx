import { useEffect, useMemo, useState } from 'react'
import { formatBRL, parseBRL, splitInstallments } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { todayInTeresina } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import type { AccountView } from './accounts'

const CHECKBOX_CLASSNAME =
  'border-input accent-primary h-4 w-4 rounded focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-hidden'

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
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Lançar</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo lançamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-lancamento"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="lancamento-descricao">Descrição</Label>
              <Input
                id="lancamento-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lancamento-valor">Valor</Label>
              <Input
                id="lancamento-valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="1.360,00"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="lancamento-data">Data</Label>
                <Ajuda rotulo="Competência">
                  O mês em que a fatura fecha, não o da compra. Compra em 28/07
                  num cartão que fecha dia 25 cai na competência de agosto.
                </Ajuda>
              </div>
              <Input
                id="lancamento-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lancamento-conta">Conta</Label>
              <select
                id="lancamento-conta"
                className={SELECT_CLASSNAME}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASSNAME}
                  checked={entrada}
                  onChange={(e) => setEntrada(e.target.checked)}
                />
                Entrada
              </label>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={CHECKBOX_CLASSNAME}
                    checked={isBusiness}
                    onChange={(e) => setIsBusiness(e.target.checked)}
                  />
                  PJ
                </label>
                <Ajuda rotulo="PJ / PF">
                  scope é o padrão da conta; is_business é a verdade do
                  lançamento — dá para pagar algo PF pelo cartão PJ.
                </Ajuda>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASSNAME}
                  checked={parcelado}
                  onChange={(e) => setParcelado(e.target.checked)}
                />
                Parcelado
              </label>
            </div>

            {parcelado ? (
              <div className="space-y-1.5">
                <Label htmlFor="lancamento-parcelas">Parcelas</Label>
                <Input
                  id="lancamento-parcelas"
                  type="number"
                  min={1}
                  max={360}
                  value={parcelas}
                  onChange={(e) => setParcelas(Number(e.target.value))}
                />
                {previa ? (
                  <p
                    data-testid="previa-parcelas"
                    className="text-muted-foreground text-sm"
                  >
                    {parcelas}× de{' '}
                    {previa
                      .slice(0, 3)
                      .map((c) => formatBRL(c))
                      .join(' / ')}
                    {previa.length > 3 ? ' …' : ''}
                  </p>
                ) : null}
              </div>
            ) : null}

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            {okMsg ? (
              <p role="status" className="text-success text-sm">
                {okMsg}
              </p>
            ) : null}
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Gravar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
