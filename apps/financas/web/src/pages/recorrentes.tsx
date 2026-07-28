import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@piluvitu/ui/dialog'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { formatRange } from '../lib/commitments'
import { todayInTeresina } from '../lib/dates'
import { CHECKBOX_CLASSNAME, SELECT_CLASSNAME } from '../lib/form-classes'
import type { AccountView } from './accounts'

/**
 * Fatia ⑥ (Task 5, docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md):
 * tela de CRUD pra `recurring_expenses` — Starlink R$ 189, DAS R$ 12–600,
 * contador e INSS, que até aqui não tinham onde ser cadastrados. Espelha o
 * shape de `RecurringExpense` (Worker, `src/domain/recurring.ts`).
 */
export type RecurringExpenseView = {
  id: string
  description: string
  category_id: string | null
  account_id: string | null
  scope: 'PJ' | 'PF'
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on: string | null
  active: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type CategoryOption = { id: string; name: string }

const SCOPES = ['PJ', 'PF'] as const
// Valor de "nenhuma categoria/conta" no <select> — string vazia em vez de
// um sentinel tipo '__nenhuma__' porque o backend já trata '' e undefined
// como "não informado" pro campo virar null (ver enviar() abaixo).
const NENHUMA = ''

/**
 * Confirmação de exclusão via `Dialog` do design system, nunca
 * `window.confirm()` — mesma decisão (e mesmo motivo: o modo de falha real
 * do Chrome Android, ver `debt-detail.tsx`) já tomada na Task 5 da fatia de
 * exclusão/ajuda.
 */
type ConfirmacaoPendente = {
  titulo: string
  mensagem: string
  onConfirm: () => void | Promise<void>
}

function dd(n: number): string {
  return String(n).padStart(2, '0')
}

// Sem prefixo 'R$ ' no campo — mesmo padrão de pages/config.tsx#paraCampo.
function paraCampo(cents: number): string {
  return formatBRL(cents).replace('R$ ', '')
}

const FORM_INICIAL = {
  descricao: '',
  categoryId: NENHUMA,
  accountId: NENHUMA,
  scope: 'PJ' as 'PJ' | 'PF',
  diaDoMes: '1',
  varia: false,
  valorMin: '',
  valorMax: '',
  terminaEm: '',
  notas: '',
  ativa: true,
}

export function RecorrentesPage() {
  const [recorrentes, setRecorrentes] = useState<RecurringExpenseView[] | null>(
    null,
  )
  const [categorias, setCategorias] = useState<CategoryOption[]>([])
  const [contas, setContas] = useState<AccountView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [descricao, setDescricao] = useState(FORM_INICIAL.descricao)
  const [categoryId, setCategoryId] = useState(FORM_INICIAL.categoryId)
  const [accountId, setAccountId] = useState(FORM_INICIAL.accountId)
  const [scope, setScope] = useState<'PJ' | 'PF'>(FORM_INICIAL.scope)
  const [diaDoMes, setDiaDoMes] = useState(FORM_INICIAL.diaDoMes)
  const [varia, setVaria] = useState(FORM_INICIAL.varia)
  const [valorMin, setValorMin] = useState(FORM_INICIAL.valorMin)
  const [valorMax, setValorMax] = useState(FORM_INICIAL.valorMax)
  const [comecaEm, setComecaEm] = useState(() => todayInTeresina())
  const [terminaEm, setTerminaEm] = useState(FORM_INICIAL.terminaEm)
  const [notas, setNotas] = useState(FORM_INICIAL.notas)
  const [ativa, setAtiva] = useState(FORM_INICIAL.ativa)
  const [formError, setFormError] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Exclusão (mesmo padrão de debt-detail.tsx): `processando` guarda o id
  // da linha em voo, pra desabilitar só o botão daquela linha.
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(
    null,
  )

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    // GET /api/recurring devolve TODAS as recorrentes, ativas E pausadas
    // (includeInactive: true, decisão do Task 4/routes/recurring.ts) — é
    // essa a rota de CRUD/gestão, ao contrário de projectRecurring/
    // commitments(), que só usam as ativas.
    const [rec, cat, cts] = await Promise.all([
      api<RecurringExpenseView[]>('/api/recurring'),
      api<CategoryOption[]>('/api/categories?kind=expense'),
      api<AccountView[]>('/api/accounts'),
    ])
    if (!vivo()) return
    setRecorrentes(rec)
    setCategorias(cat)
    setContas(cts)
  }, [])

  useEffect(() => {
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  function limparFormulario() {
    setEditandoId(null)
    setDescricao(FORM_INICIAL.descricao)
    setCategoryId(FORM_INICIAL.categoryId)
    setAccountId(FORM_INICIAL.accountId)
    setScope(FORM_INICIAL.scope)
    setDiaDoMes(FORM_INICIAL.diaDoMes)
    setVaria(FORM_INICIAL.varia)
    setValorMin(FORM_INICIAL.valorMin)
    setValorMax(FORM_INICIAL.valorMax)
    setComecaEm(todayInTeresina())
    setTerminaEm(FORM_INICIAL.terminaEm)
    setNotas(FORM_INICIAL.notas)
    setAtiva(FORM_INICIAL.ativa)
    setFormError(null)
  }

  function editar(r: RecurringExpenseView) {
    const temFaixa = r.amount_min_cents !== r.amount_max_cents
    setEditandoId(r.id)
    setDescricao(r.description)
    setCategoryId(r.category_id ?? NENHUMA)
    setAccountId(r.account_id ?? NENHUMA)
    setScope(r.scope)
    setDiaDoMes(String(r.day_of_month))
    setVaria(temFaixa)
    setValorMin(paraCampo(r.amount_min_cents))
    setValorMax(temFaixa ? paraCampo(r.amount_max_cents) : '')
    setComecaEm(r.starts_on)
    setTerminaEm(r.ends_on ?? '')
    setNotas(r.notes ?? '')
    setAtiva(r.active === 1)
    setFormError(null)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (descricao.trim() === '') {
      setFormError('Dê uma descrição para a recorrente.')
      return
    }
    const dia = Number(diaDoMes)
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      setFormError('Dia do mês precisa ser um número inteiro entre 1 e 31.')
      return
    }
    if (comecaEm.trim() === '') {
      setFormError('Informe a partir de quando a recorrente vale.')
      return
    }

    let minCents: number
    try {
      minCents = parseBRL(valorMin)
    } catch {
      setFormError('Valor inválido. Use o formato 189,00.')
      return
    }
    if (minCents <= 0) {
      setFormError('Valor inválido. Use o formato 189,00.')
      return
    }

    let maxCents = minCents
    if (varia) {
      try {
        maxCents = parseBRL(valorMax)
      } catch {
        setFormError('Valor máximo inválido. Use o formato 600,00.')
        return
      }
      if (maxCents < minCents) {
        setFormError(
          'O valor máximo não pode ser menor que o mínimo — troque os dois ou desmarque "varia?".',
        )
        return
      }
    }

    setSalvando(true)
    try {
      const payload = {
        description: descricao,
        category_id: categoryId || null,
        account_id: accountId || null,
        scope,
        day_of_month: dia,
        amount_min_cents: minCents,
        amount_max_cents: maxCents,
        starts_on: comecaEm,
        ends_on: terminaEm || null,
        active: ativa ? 1 : 0,
        notes: notas || null,
      }
      if (editandoId) {
        await api(`/api/recurring/${editandoId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        await api('/api/recurring', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      limparFormulario()
      await carregar()
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  function excluir(r: RecurringExpenseView) {
    setConfirmacao({
      titulo: 'Excluir recorrente',
      mensagem: `Excluir "${r.description}"? Isso não apaga nenhum lançamento já feito — só a definição da recorrência. Não há como desfazer.`,
      onConfirm: async () => {
        setAcaoErro(null)
        setProcessando(r.id)
        try {
          await api(`/api/recurring/${r.id}`, { method: 'DELETE' })
          if (editandoId === r.id) limparFormulario()
          await carregar()
        } catch (err: unknown) {
          setAcaoErro(err instanceof ApiError ? err.message : String(err))
        } finally {
          setProcessando(null)
        }
      },
    })
  }

  if (loadError) return <p role="alert">{loadError}</p>
  if (!recorrentes) return <p>Carregando…</p>

  const nomeCategoria = (id: string | null) =>
    id === null ? null : (categorias.find((c) => c.id === id)?.name ?? null)
  const nomeConta = (id: string | null) =>
    id === null ? null : (contas.find((c) => c.id === id)?.name ?? null)

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Recorrentes</h1>

      {acaoErro ? (
        <p role="alert" className="text-destructive text-sm">
          {acaoErro}
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {recorrentes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma despesa recorrente cadastrada ainda.
            </p>
          ) : (
            <ul className="space-y-3" data-testid="lista-recorrentes">
              {recorrentes.map((r) => (
                <li
                  key={r.id}
                  data-testid={`recorrente-${r.id}`}
                  className="rounded-md border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {r.description}
                        {r.active === 0 ? (
                          <span
                            data-testid={`status-${r.id}`}
                            className="text-muted-foreground ml-2 text-xs font-normal"
                          >
                            Pausada
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {r.scope} · dia {dd(r.day_of_month)}
                        {nomeCategoria(r.category_id)
                          ? ` · ${nomeCategoria(r.category_id)}`
                          : ''}
                        {nomeConta(r.account_id)
                          ? ` · ${nomeConta(r.account_id)}`
                          : ''}
                      </p>
                    </div>
                    <span
                      data-testid={`faixa-${r.id}`}
                      className="text-right text-sm font-semibold whitespace-nowrap"
                    >
                      {formatRange({
                        min: r.amount_min_cents,
                        max: r.amount_max_cents,
                      })}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-3">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => editar(r)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="text-destructive h-auto p-0 text-xs"
                      disabled={processando === r.id}
                      onClick={() => excluir(r)}
                    >
                      {processando === r.id ? 'Excluindo…' : 'Excluir'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editandoId ? 'Editar recorrente' : 'Nova recorrente'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-recorrente"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="recorrente-descricao">Descrição</Label>
              <Input
                id="recorrente-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-categoria">Categoria</Label>
                <select
                  id="recorrente-categoria"
                  className={SELECT_CLASSNAME}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value={NENHUMA}>— nenhuma —</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-conta">Conta</Label>
                <select
                  id="recorrente-conta"
                  className={SELECT_CLASSNAME}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value={NENHUMA}>— nenhuma —</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-escopo">Escopo</Label>
                <select
                  id="recorrente-escopo"
                  className={SELECT_CLASSNAME}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'PJ' | 'PF')}
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-dia">Dia do mês</Label>
                <Input
                  id="recorrente-dia"
                  type="number"
                  min={1}
                  max={31}
                  value={diaDoMes}
                  onChange={(e) => setDiaDoMes(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recorrente-valor">
                {varia ? 'Valor mínimo' : 'Valor'}
              </Label>
              <Input
                id="recorrente-valor"
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                placeholder="189,00"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={CHECKBOX_CLASSNAME}
                    checked={varia}
                    onChange={(e) => setVaria(e.target.checked)}
                  />
                  Varia?
                </label>
                <Ajuda rotulo="Faixa">
                  O Simples varia de R$ 12 a R$ 600 conforme o faturamento —
                  entrar com a média (R$ 306) seria o número que NUNCA acontece.
                  Marque "varia?" e informe o piso (mínimo garantido) e o teto
                  (pior mês); deixe desmarcado pra um valor fixo, como o
                  Starlink.
                </Ajuda>
              </div>

              {varia ? (
                <div className="space-y-1.5 pt-1.5">
                  <Label htmlFor="recorrente-valor-max">Valor máximo</Label>
                  <Input
                    id="recorrente-valor-max"
                    value={valorMax}
                    onChange={(e) => setValorMax(e.target.value)}
                    placeholder="600,00"
                  />
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-inicio">Começa em</Label>
                <Input
                  id="recorrente-inicio"
                  type="date"
                  value={comecaEm}
                  onChange={(e) => setComecaEm(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-fim">Termina em (opcional)</Label>
                <Input
                  id="recorrente-fim"
                  type="date"
                  value={terminaEm}
                  onChange={(e) => setTerminaEm(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recorrente-notas">Notas (opcional)</Label>
              <Input
                id="recorrente-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={CHECKBOX_CLASSNAME}
                checked={ativa}
                onChange={(e) => setAtiva(e.target.checked)}
              />
              Ativa
            </label>

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando…'
                  : editandoId
                    ? 'Salvar alterações'
                    : 'Criar recorrente'}
              </Button>
              {editandoId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={limparFormulario}
                >
                  Cancelar edição
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={confirmacao !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmacao(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmacao?.titulo}</DialogTitle>
            <DialogDescription>{confirmacao?.mensagem}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const pedido = confirmacao
                setConfirmacao(null)
                void pedido?.onConfirm()
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
