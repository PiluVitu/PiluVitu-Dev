import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CircleAlert,
  Check,
  Flag,
  Plus,
  Repeat2,
  TriangleAlert,
} from 'lucide-react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@piluvitu/ui/sheet'
import { api, ApiError } from '../api'
import { KpiCard } from '../blocos/KpiCard'
import { todayInTeresina } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import {
  faltaDaMeta,
  formatPrazo,
  larguraDaBarra,
  plural,
  previaDoRitmo,
  resumoDasMetas,
  ritmoDaMeta,
  rotuloDoStatus,
  type MetaView,
} from '../lib/metas'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import { FAIXA_ALERTA, GRID_KPI, TRILHO_BARRA } from '../lib/superficie'
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

const GRID_CARTOES =
  'grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4'

export type CartaoDaMetaProps = {
  meta: MetaView
  confirmando: boolean
  ocupado: boolean
  erro: string | null
  onEditar: () => void
  onExcluir: () => void
  onConfirmarExclusao: () => void
  onCancelarExclusao: () => void
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
}: CartaoDaMetaProps) {
  const concluida = meta.status === 'concluida'
  const atrasada = meta.status === 'atrasada'
  const cor = concluida ? 'ok' : atrasada ? 'destructive' : 'primary'
  return (
    <li
      aria-label={meta.name}
      className={cn(
        'bg-card flex flex-col gap-3 rounded-[18px] border px-6 py-5',
        atrasada && 'border-destructive/40',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h2 className="text-base font-bold tracking-[-0.01em]">{meta.name}</h2>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase',
            cor === 'ok' && 'text-ok border-ok bg-ok/10',
            cor === 'destructive' &&
              'text-destructive border-destructive bg-destructive/[0.08]',
            cor === 'primary' && 'text-primary border-primary bg-primary/10',
          )}
        >
          {concluida ? <Check aria-hidden className="size-[11px]" /> : null}
          {atrasada ? (
            <CircleAlert aria-hidden className="size-[11px]" />
          ) : null}
          {rotuloDoStatus(meta)}
        </span>
        <span className={cn(META_MONO, 'ml-auto uppercase')}>
          {meta.account_name}
        </span>
      </div>

      <p className="text-2xl leading-[1.1] font-semibold tabular-nums">
        {formatBRL(meta.balance_cents)}{' '}
        <span className="text-muted-foreground text-[13px] font-normal">
          de {formatBRL(meta.target_cents)}
        </span>
      </p>

      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={`Progresso da meta ${meta.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={larguraDaBarra(meta.pct)}
          className={cn(TRILHO_BARRA, 'h-2 flex-1')}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none',
              cor === 'ok' && 'bg-ok',
              cor === 'destructive' && 'bg-destructive',
              cor === 'primary' && 'bg-primary',
            )}
            style={{ width: `${larguraDaBarra(meta.pct)}%` }}
          />
        </div>
        <span className={cn(META_MONO, 'w-10 shrink-0 text-right')}>
          {meta.pct}%
        </span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Prazo</dt>
        <dd className="tabular-nums">
          {meta.target_date ? formatPrazo(meta.target_date) : 'sem prazo'}
        </dd>
        <dt className="text-muted-foreground">Falta</dt>
        <dd className="tabular-nums">{faltaDaMeta(meta)}</dd>
        <dt className="text-muted-foreground">Ritmo</dt>
        <dd
          className={cn(
            'font-semibold tabular-nums',
            atrasada && 'text-destructive',
          )}
        >
          {ritmoDaMeta(meta)}
        </dd>
      </dl>

      {meta.reserve_overlap ? (
        <p className="text-muted-foreground text-xs">
          Esta conta também conta na reserva de emergência: o mesmo dinheiro
          aparece nos dois lugares.
        </p>
      ) : null}
      {!meta.editable ? (
        <p className="text-muted-foreground text-xs">
          Conta arquivada: a meta não pode ser editada.
        </p>
      ) : null}
      {erro ? (
        <p role="alert" className={FAIXA_ALERTA}>
          {erro}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {!concluida && meta.editable ? (
          <a
            href={`#/lancar/transferir?para=${encodeURIComponent(meta.account_id)}`}
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3 text-[13px] font-semibold"
          >
            <Repeat2 aria-hidden className="size-3.5" />
            Registrar aporte
          </a>
        ) : null}
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
            className="text-muted-foreground min-h-11"
            disabled={ocupado}
            onClick={onExcluir}
          >
            Excluir
          </Button>
        )}
      </div>
    </li>
  )
}

function FormularioDaMeta({
  titulo,
  inicial,
  contas,
  hoje,
  onSalvar,
  onCancelar,
}: {
  titulo: string
  inicial: MetaView | null
  contas: AccountView[]
  hoje: string
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

  const alvo = (() => {
    try {
      const c = parseBRL(valor)
      return c > 0 ? c : null
    } catch {
      return null
    }
  })()
  const saldo = contas.find((c) => c.id === conta)?.balance_cents ?? null
  const previa = previaDoRitmo({
    saldo_cents: saldo,
    alvo_cents: alvo,
    prazo: prazo === '' ? null : prazo,
    hoje,
  })

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
    <form aria-label={titulo} onSubmit={enviar} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`meta-nome-${id}`}>Nome</Label>
        <Input
          id={`meta-nome-${id}`}
          className="h-11"
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`meta-valor-${id}`}>Valor da meta</Label>
          <Input
            id={`meta-valor-${id}`}
            className="h-11"
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
            className="h-11"
            type="date"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`meta-conta-${id}`}>Conta onde o dinheiro fica</Label>
        <select
          id={`meta-conta-${id}`}
          className={cn(SELECT_CLASSNAME, 'h-11')}
          value={conta}
          onChange={(e) => setConta(e.target.value)}
        >
          <option value="">Escolha uma conta</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {formatBRL(c.balance_cents)}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          O saldo de hoje já conta como progresso. Cartão e benefício não
          entram.
        </p>
      </div>
      <div
        aria-live="polite"
        className="bg-background flex items-center gap-3 rounded-[14px] border px-3.5 py-3"
      >
        <Flag aria-hidden className="text-primary size-5 shrink-0" />
        <p className="text-[13px] leading-[1.45]">
          {previa ?? 'Preencha o valor e a conta para ver o ritmo.'}
        </p>
      </div>
      {erro ? (
        <p role="alert" className={FAIXA_ALERTA}>
          {erro}
        </p>
      ) : null}
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="min-h-11 flex-1" disabled={ocupado}>
          Salvar meta
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground min-h-11"
          onClick={onCancelar}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function Carregando() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className={GRID_KPI}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-secondary h-[98px] rounded-2xl" />
        ))}
      </div>
      <div className={GRID_CARTOES}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-secondary h-[230px] rounded-[18px]" />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">Carregando as metas…</p>
    </div>
  )
}

type Folha =
  | { tipo: 'nova'; sessao: number }
  | { tipo: 'editar'; id: string; sessao: number }

export function MetasPage({ hoje }: { hoje?: string }) {
  const dia = hoje ?? todayInTeresina()
  const [metas, setMetas] = useState<MetaView[] | null>(null)
  const [contas, setContas] = useState<AccountView[]>([])
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  // Cada abertura da folha ganha um número; salvar só fecha a folha da
  // abertura que o iniciou, nunca uma reaberta depois.
  const [folha, setFolha] = useState<Folha | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [emVoo, setEmVoo] = useState<string[]>([])
  const [errosDeExclusao, setErrosDeExclusao] = useState<
    Record<string, string>
  >({})
  const sessoes = useRef(0)
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

  const iniciar = useCallback(() => {
    setErroCarga(null)
    carregar().catch((e: unknown) =>
      setErroCarga(e instanceof ApiError ? e.message : String(e)),
    )
  }, [carregar])

  useEffect(() => {
    iniciar()
  }, [iniciar])

  async function salvar(id: string | null, dados: Dados, sessao: number) {
    const r = await mutarERecarregar(
      () =>
        api(id ? `/api/goals/${id}` : '/api/goals', {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(dados),
        }),
      carregar,
    )
    if (r.ok) setFolha((atual) => (atual?.sessao === sessao ? null : atual))
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

  const abrirNova = () => setFolha({ tipo: 'nova', sessao: ++sessoes.current })

  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground max-w-[62ch] text-sm leading-relaxed">
        Cada meta acompanha o saldo de uma conta. O progresso é o que já está
        guardado lá; o ritmo diz quanto falta por mês até o prazo.
      </p>
      <Button
        type="button"
        className="min-h-11 shrink-0 gap-2"
        onClick={abrirNova}
      >
        <Plus aria-hidden className="size-4" />
        Nova meta
      </Button>
    </div>
  )

  if (erroCarga)
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <div
          role="alert"
          className="border-destructive/25 bg-destructive/[0.07] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[18px] border px-6 py-5"
        >
          <TriangleAlert aria-hidden className="text-destructive size-5" />
          <div className="min-w-56 flex-1">
            <p className="text-destructive font-semibold">
              Não foi possível carregar as metas
            </p>
            <p className="text-muted-foreground text-sm">
              {erroCarga} Suas metas continuam salvas.
            </p>
          </div>
          <Button className="min-h-11" onClick={iniciar}>
            Tentar de novo
          </Button>
        </div>
      </div>
    )

  if (!metas)
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Carregando />
      </div>
    )

  const contasComMeta = new Set(metas.map((m) => m.account_id))
  const contasLivres = contas.filter(
    (c) => TIPOS_DE_CONTA.includes(c.kind) && !contasComMeta.has(c.id),
  )
  const editada =
    folha?.tipo === 'editar' ? metas.find((m) => m.id === folha.id) : undefined
  const contasDaFolha = editada
    ? [...contas.filter((c) => c.id === editada.account_id), ...contasLivres]
    : contasLivres
  const resumo = resumoDasMetas(metas)

  return (
    <div className="flex flex-col gap-4">
      {cabecalho}

      {metas.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-[18px] border border-dashed px-6 py-12 text-center">
          <Flag aria-hidden className="text-muted-foreground size-9" />
          <p className="text-base font-semibold">Nenhuma meta ainda</p>
          <p className="text-muted-foreground max-w-[44ch] text-sm">
            Uma meta liga um objetivo a uma conta: o saldo dela é o progresso.
            Serve para uma viagem, um curso, a entrada de um carro.
          </p>
          <Button type="button" className="min-h-11 gap-2" onClick={abrirNova}>
            <Plus aria-hidden className="size-4" />
            Criar a primeira meta
          </Button>
        </div>
      ) : (
        <>
          <section aria-label="Resumo das metas" className={GRID_KPI}>
            <KpiCard
              rotulo="Guardado"
              valor={formatBRL(resumo.guardado_cents)}
              contexto={`em ${plural(resumo.total, 'meta', 'metas')}${resumo.concluidas > 0 ? ` · ${plural(resumo.concluidas, 'concluída', 'concluídas')}` : ''}`}
            />
            <KpiCard
              rotulo="Falta guardar"
              valor={formatBRL(resumo.falta_cents)}
              contexto={
                resumo.abertas > 0
                  ? `para fechar ${resumo.abertas === 1 ? 'a' : 'as'} ${resumo.abertas} em andamento`
                  : 'nenhuma meta em andamento'
              }
            />
            <KpiCard
              rotulo="Ritmo por mês"
              valor={formatBRL(resumo.ritmo_cents)}
              contexto={
                resumo.com_prazo_count > 0
                  ? 'soma do que cada meta com prazo pede'
                  : 'nenhuma meta com prazo'
              }
            />
          </section>

          <ul aria-label="Metas" className={GRID_CARTOES}>
            {metas.map((m) => (
              <CartaoDaMeta
                key={m.id}
                meta={m}
                confirmando={confirmandoId === m.id}
                ocupado={emVoo.includes(m.id)}
                erro={errosDeExclusao[m.id] ?? null}
                onEditar={() =>
                  setFolha({
                    tipo: 'editar',
                    id: m.id,
                    sessao: ++sessoes.current,
                  })
                }
                onExcluir={() => setConfirmandoId(m.id)}
                onConfirmarExclusao={() => excluir(m.id)}
                onCancelarExclusao={() => setConfirmandoId(null)}
              />
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            O aporte é uma transferência para a conta da meta, no Lançar.
          </p>
        </>
      )}

      <Sheet
        open={
          folha !== null && (folha.tipo === 'nova' || editada !== undefined)
        }
        onOpenChange={(aberta) => {
          if (!aberta) setFolha(null)
        }}
      >
        <SheetContent
          side="bottom"
          aria-label={
            folha?.tipo === 'nova'
              ? 'Nova meta'
              : `Editar ${editada?.name ?? ''}`
          }
          className="mx-auto max-h-[85vh] max-w-xl overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
        >
          <SheetTitle>
            {folha?.tipo === 'nova'
              ? 'Nova meta'
              : `Editar ${editada?.name ?? ''}`}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Nome, valor, prazo e a conta onde o dinheiro fica guardado.
          </SheetDescription>
          {folha ? (
            <FormularioDaMeta
              key={folha.sessao}
              titulo={
                folha.tipo === 'nova'
                  ? 'Nova meta'
                  : `Editar ${editada?.name ?? ''}`
              }
              inicial={editada ?? null}
              contas={contasDaFolha}
              hoje={dia}
              onSalvar={(d) =>
                salvar(
                  folha.tipo === 'editar' ? folha.id : null,
                  d,
                  folha.sessao,
                )
              }
              onCancelar={() => setFolha(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
