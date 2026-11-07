import { useCallback, useEffect, useRef, useState } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import {
  formatPrazo,
  larguraDaBarra,
  plural,
  rotuloDoStatus,
  type MetaView,
} from '../lib/metas'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import {
  CARTAO_SECAO,
  CHIP_MONO,
  FAIXA_ALERTA,
  TRILHO_BARRA,
} from '../lib/superficie'
import { META_MONO } from '../lib/tipografia'
import type { AccountView } from './accounts'

// Cartão não guarda dinheiro e benefício (vale) não se acumula: o Worker recusa.
const TIPOS_DE_CONTA = ['checking', 'savings', 'cash', 'investment']

type Dados = {
  name: string
  target_cents: number
  account_id: string
  target_date: string | null
}

export type CartaoDaMetaProps = {
  meta: MetaView
  confirmando: boolean
  ocupado: boolean
  erro: string | null
  onEditar: () => void
  onExcluir: () => void
  onConfirmarExclusao: () => void
  onCancelarExclusao: () => void
  children?: React.ReactNode
}

export function CartaoDaMeta({
  meta,
  confirmando,
  ocupado,
  erro,
  onEditar,
  onExcluir,
  onConfirmarExclusao,
  onCancelarExclusao,
  children,
}: CartaoDaMetaProps) {
  const rotulo = rotuloDoStatus(meta.status)
  return (
    <li
      aria-label={meta.name}
      className="flex flex-col gap-2 border-b py-4 last:border-b-0 last:pb-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold">{meta.name}</span>
          {rotulo ? (
            <span
              className={cn(
                CHIP_MONO,
                meta.status === 'atrasada'
                  ? 'text-destructive border-destructive/40'
                  : 'text-primary border-primary/40',
              )}
            >
              {rotulo}
            </span>
          ) : null}
        </span>
        <span className="text-sm tabular-nums">
          {formatBRL(meta.balance_cents)}
          <span className="text-muted-foreground">
            {' '}
            de {formatBRL(meta.target_cents)}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={`Progresso da meta ${meta.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={larguraDaBarra(meta.pct)}
          className={cn(TRILHO_BARRA, 'h-2')}
        >
          <div
            className={cn(
              'h-full rounded-full',
              meta.status === 'atrasada' ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${larguraDaBarra(meta.pct)}%` }}
          />
        </div>
        <span className={cn(META_MONO, 'w-12 shrink-0 text-right')}>
          {meta.pct}%
        </span>
      </div>

      <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
        <p>Conta: {meta.account_name}</p>
        {meta.status !== 'concluida' ? (
          <p>Faltam {formatBRL(meta.missing_cents)}</p>
        ) : null}
        {meta.target_date ? (
          <p>Prazo: {formatPrazo(meta.target_date)}</p>
        ) : null}
        {meta.monthly_needed_cents !== null && meta.months_left !== null ? (
          <p>
            Guardar {formatBRL(meta.monthly_needed_cents)} por mês (
            {plural(meta.months_left, 'mês', 'meses')})
          </p>
        ) : null}
        {meta.reserve_overlap ? (
          <p>
            Esta conta também conta na reserva de emergência: o mesmo dinheiro
            aparece nos dois lugares.
          </p>
        ) : null}
        {!meta.editable ? (
          <p>Conta arquivada: a meta não pode ser editada.</p>
        ) : null}
      </div>

      {erro ? (
        <p role="alert" className={FAIXA_ALERTA}>
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {meta.editable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={ocupado}
            onClick={onEditar}
          >
            Editar
          </Button>
        ) : null}
        {confirmando ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="min-h-11"
              disabled={ocupado}
              onClick={onConfirmarExclusao}
            >
              Confirmar exclusão
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={ocupado}
              onClick={onCancelarExclusao}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={ocupado}
            onClick={onExcluir}
          >
            Excluir
          </Button>
        )}
      </div>
      {children}
    </li>
  )
}

function FormularioDaMeta({
  titulo,
  inicial,
  contas,
  onSalvar,
  onCancelar,
}: {
  titulo: string
  inicial: MetaView | null
  contas: AccountView[]
  onSalvar: (dados: Dados) => Promise<string | null>
  onCancelar: () => void
}) {
  const id = inicial?.id ?? 'nova'
  const [nome, setNome] = useState(inicial?.name ?? '')
  const [valor, setValor] = useState(
    inicial ? formatBRL(inicial.target_cents) : '',
  )
  const [prazo, setPrazo] = useState(inicial?.target_date ?? '')
  const [conta, setConta] = useState(inicial?.account_id ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (nome.trim() === '') return setErro('Digite o nome da meta.')
    let cents: number
    try {
      cents = parseBRL(valor)
    } catch {
      return setErro('Digite um valor em reais, como 5.000,00.')
    }
    if (cents <= 0)
      return setErro('O valor da meta precisa ser maior que zero.')
    if (conta === '')
      return setErro('Escolha a conta onde o dinheiro fica guardado.')
    setOcupado(true)
    setErro(
      await onSalvar({
        name: nome.trim(),
        target_cents: cents,
        account_id: conta,
        target_date: prazo === '' ? null : prazo,
      }),
    )
    setOcupado(false)
  }

  return (
    <form
      aria-label={titulo}
      onSubmit={enviar}
      className="bg-background mt-2 flex flex-col gap-3 rounded-[14px] border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`meta-nome-${id}`}>Nome</Label>
        <Input
          id={`meta-nome-${id}`}
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`meta-valor-${id}`}>Valor da meta</Label>
        <Input
          id={`meta-valor-${id}`}
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`meta-prazo-${id}`}>Prazo (opcional)</Label>
        <Input
          id={`meta-prazo-${id}`}
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`meta-conta-${id}`}>Conta</Label>
        <select
          id={`meta-conta-${id}`}
          className={SELECT_CLASSNAME}
          value={conta}
          onChange={(e) => setConta(e.target.value)}
        >
          <option value="">Escolha uma conta</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {erro ? (
        <p role="alert" className={FAIXA_ALERTA}>
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="min-h-11" disabled={ocupado}>
          Salvar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={onCancelar}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

export function MetasPage() {
  const [metas, setMetas] = useState<MetaView[] | null>(null)
  const [contas, setContas] = useState<AccountView[]>([])
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  // Cada abertura de formulário ganha um número; salvar só fecha o formulário
  // da abertura que o iniciou, nunca um reaberto (ou outro) depois.
  const [criando, setCriando] = useState<number | null>(null)
  const [editando, setEditando] = useState<{
    id: string
    sessao: number
  } | null>(null)
  const sessoes = useRef(0)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [emVoo, setEmVoo] = useState<string[]>([])
  const [errosDeExclusao, setErrosDeExclusao] = useState<
    Record<string, string>
  >({})
  const pedido = useRef(0)

  // A leitura mais nova vence: resposta antiga que chega depois é descartada.
  const carregar = useCallback(async () => {
    const meu = ++pedido.current
    const [m, c] = await Promise.all([
      api<MetaView[]>('/api/goals'),
      api<AccountView[]>('/api/accounts'),
    ])
    if (meu === pedido.current) {
      setMetas(m)
      setContas(c)
    }
  }, [])

  useEffect(() => {
    carregar().catch((e: unknown) =>
      setErroCarga(e instanceof ApiError ? e.message : String(e)),
    )
  }, [carregar])

  async function salvar(id: string | null, dados: Dados, sessao: number) {
    const r = await mutarERecarregar(
      () =>
        api(id ? `/api/goals/${id}` : '/api/goals', {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(dados),
        }),
      carregar,
    )
    if (r.ok) {
      if (id) setEditando((atual) => (atual?.sessao === sessao ? null : atual))
      else setCriando((atual) => (atual === sessao ? null : atual))
    }
    return r.ok ? null : r.mensagem
  }

  async function excluir(id: string) {
    setErrosDeExclusao(({ [id]: _, ...resto }) => resto)
    setEmVoo((v) => [...v, id])
    const r = await mutarERecarregar(
      () => api(`/api/goals/${id}`, { method: 'DELETE' }),
      carregar,
    )
    setEmVoo((v) => v.filter((x) => x !== id))
    setConfirmandoId((atual) => (atual === id ? null : atual))
    if (!r.ok) setErrosDeExclusao((e) => ({ ...e, [id]: r.mensagem }))
  }

  if (erroCarga) return <p role="alert">{erroCarga}</p>
  if (!metas) return <p>Carregando…</p>

  const contasComMeta = new Set(metas.map((m) => m.account_id))
  const contasLivres = contas.filter(
    (c) => TIPOS_DE_CONTA.includes(c.kind) && !contasComMeta.has(c.id),
  )
  const contasParaEditar = (m: MetaView) => [
    ...contas.filter((c) => c.id === m.account_id),
    ...contasLivres,
  ]

  return (
    <div className="flex flex-col gap-4">
      {criando !== null ? (
        <FormularioDaMeta
          titulo="Nova meta"
          inicial={null}
          contas={contasLivres}
          onSalvar={(d) => salvar(null, d, criando)}
          onCancelar={() => setCriando(null)}
        />
      ) : (
        <div>
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            onClick={() => setCriando(++sessoes.current)}
          >
            Nova meta
          </Button>
        </div>
      )}

      {metas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma meta ainda. Crie uma para acompanhar quanto já está guardado
          numa conta.
        </p>
      ) : (
        <Card className={CARTAO_SECAO}>
          <CardContent className="pt-6">
            <ul>
              {metas.map((m) => (
                <CartaoDaMeta
                  key={m.id}
                  meta={m}
                  confirmando={confirmandoId === m.id}
                  ocupado={emVoo.includes(m.id)}
                  erro={errosDeExclusao[m.id] ?? null}
                  onEditar={() =>
                    setEditando({ id: m.id, sessao: ++sessoes.current })
                  }
                  onExcluir={() => setConfirmandoId(m.id)}
                  onConfirmarExclusao={() => excluir(m.id)}
                  onCancelarExclusao={() => setConfirmandoId(null)}
                >
                  {editando?.id === m.id ? (
                    <FormularioDaMeta
                      titulo={`Editar ${m.name}`}
                      inicial={m}
                      contas={contasParaEditar(m)}
                      onSalvar={(d) => salvar(m.id, d, editando.sessao)}
                      onCancelar={() => setEditando(null)}
                    />
                  ) : null}
                </CartaoDaMeta>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
