import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { KpiCard } from '../blocos/KpiCard'
import {
  addMonthsToCompetence,
  competenciaAtual,
  todayInTeresina,
} from '../lib/dates'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import {
  estadoDoOrcamento,
  larguraDaBarra,
  marcaDeHoje,
  mesAbreviado,
  mesPorExtenso,
  ordenarLinhas,
  percentualUsado,
  resumoDoMes,
  type EstadoOrcamento,
  type LinhaOrcamento,
  type RelatorioOrcamento,
} from '../lib/orcamento'
import {
  CARTAO_SECAO,
  CHIP_MONO,
  FAIXA_ALERTA,
  GRID_KPI,
  TRILHO_BARRA,
} from '../lib/superficie'
import { META_MONO, ROTULO_SECAO } from '../lib/tipografia'

type Salvar = (categoryId: string, cents: number) => Promise<string | null>
type Remover = (categoryId: string) => Promise<string | null>

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}

function mensagemDeCopia(copied: number, skipped: number): string {
  if (copied === 0 && skipped === 0)
    return 'O mês anterior não tem orçamento para copiar.'
  return `${plural(copied, 'copiado', 'copiados')}, ${plural(skipped, 'ignorado', 'ignorados')}.`
}

const COR_BARRA: Record<EstadoOrcamento, string> = {
  estourado: 'bg-destructive',
  atencao: 'bg-warn',
  dentro: 'bg-primary',
  sem_orcamento: 'bg-primary',
}

const nomeDaLinha = (l: LinhaOrcamento) =>
  l.parent_name ? `${l.parent_name} › ${l.category_name}` : l.category_name

export type LinhaDoOrcamentoProps = {
  linha: LinhaOrcamento
  onEditar: () => void
  onRemover: () => void
  ocupado: boolean
  erro: string | null
  children?: React.ReactNode
}

export function LinhaDoOrcamento({
  linha,
  onEditar,
  onRemover,
  ocupado,
  erro,
  children,
}: LinhaDoOrcamentoProps) {
  const { budget_cents: orcado, spent_cents: gasto } = linha
  const estado = estadoDoOrcamento(orcado, gasto)
  const pct = percentualUsado(orcado, gasto)
  const nome = nomeDaLinha(linha)
  const alerta = estado === 'estourado'
  const atencao = estado === 'atencao'

  return (
    <li
      aria-label={nome}
      className="flex flex-col gap-2 border-b py-3.5 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm font-semibold">{nome}</span>
        {alerta || atencao ? (
          <span
            className={cn(
              CHIP_MONO,
              'gap-1',
              alerta
                ? 'text-destructive border-destructive bg-destructive/[0.08]'
                : 'text-warn border-warn bg-warn/10',
            )}
          >
            {alerta ? (
              <TriangleAlert aria-hidden className="size-[11px]" />
            ) : (
              <CircleAlert aria-hidden className="size-[11px]" />
            )}
            {alerta ? 'Estourado' : 'Atenção'}
          </span>
        ) : null}
        <span className="ml-auto text-sm whitespace-nowrap tabular-nums">
          <strong>{formatBRL(gasto)}</strong>
          {orcado !== null ? (
            <span className="text-muted-foreground">
              {' '}
              de {formatBRL(orcado)}
            </span>
          ) : null}
        </span>
      </div>

      {orcado !== null ? (
        <>
          <div className="flex items-center gap-3">
            <div
              role="progressbar"
              aria-label={`Uso do orçamento de ${nome}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, pct ?? 0)}
              className={cn(TRILHO_BARRA, 'h-2 flex-1')}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none',
                  COR_BARRA[estado],
                )}
                style={{ width: `${larguraDaBarra(orcado, gasto)}%` }}
              />
            </div>
            <span className={cn(META_MONO, 'w-12 shrink-0 text-right')}>
              {pct}%
            </span>
            {linha.budgetable ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 gap-1.5 text-xs"
                aria-label={`Editar limite de ${nome}`}
                disabled={ocupado}
                onClick={onEditar}
              >
                <Pencil aria-hidden className="size-[13px]" />
                Editar
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-9 text-xs"
                aria-label={`Remover limite de ${nome}`}
                disabled={ocupado}
                onClick={onRemover}
              >
                Remover limite
              </Button>
            )}
          </div>
          <p
            className={cn(
              'text-xs',
              alerta ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {alerta
              ? `${formatBRL(gasto - orcado)} acima do limite`
              : `Restam ${formatBRL(orcado - gasto)}${atencao ? ' · 80% ou mais já usado' : ''}`}
          </p>
          {!linha.budgetable ? (
            <p className="text-muted-foreground text-xs">
              Categoria arquivada ou que não é de despesa: não aceita novo
              limite.
            </p>
          ) : null}
        </>
      ) : null}

      {erro ? (
        <p role="alert" className={FAIXA_ALERTA}>
          {erro}
        </p>
      ) : null}
      {children}
    </li>
  )
}

function EditorDoLimite({
  linha,
  mesNome,
  onSalvar,
  onRemover,
  onCancelar,
}: {
  linha: LinhaOrcamento
  mesNome: string
  onSalvar: (cents: number) => Promise<string | null>
  onRemover: () => Promise<string | null>
  onCancelar: () => void
}) {
  const nome = nomeDaLinha(linha)
  const existente = linha.budget_cents !== null
  const [valor, setValor] = useState(
    existente ? formatBRL(linha.budget_cents as number) : '',
  )
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const id = `limite-${linha.category_id}`

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    let cents: number
    try {
      cents = parseBRL(valor)
    } catch {
      setErro('Digite um valor em reais, como 250,00.')
      return
    }
    if (cents <= 0) {
      setErro('O valor precisa ser maior que zero.')
      return
    }
    setOcupado(true)
    setErro(await onSalvar(cents))
    setOcupado(false)
  }

  async function remover() {
    setErro(null)
    setOcupado(true)
    setErro(await onRemover())
    setOcupado(false)
  }

  return (
    <form
      aria-label={`${existente ? 'Editar' : 'Definir'} limite de ${nome}`}
      onSubmit={salvar}
      className="bg-background mt-1 flex flex-wrap items-end gap-3 rounded-[14px] border p-4"
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <Label htmlFor={id}>{`Limite de ${nome} em ${mesNome}`}</Label>
        <Input
          id={id}
          inputMode="decimal"
          placeholder="R$ 0,00"
          className="h-11"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {linha.average_3m_cents > 0
            ? `Média dos últimos 3 meses: ${formatBRL(linha.average_3m_cents)}`
            : 'Sem gasto nos últimos 3 meses.'}
        </p>
      </div>
      <Button type="submit" className="min-h-11" disabled={ocupado}>
        Salvar
      </Button>
      {existente ? (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive min-h-11"
          disabled={ocupado}
          onClick={remover}
        >
          Remover limite
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground min-h-11"
        onClick={onCancelar}
      >
        Cancelar
      </Button>
      {erro ? (
        <p role="alert" className={cn(FAIXA_ALERTA, 'w-full')}>
          {erro}
        </p>
      ) : null}
    </form>
  )
}

function Carregando({ mes }: { mes: string }) {
  const bloco = 'bg-secondary rounded-full'
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className={GRID_KPI}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-secondary h-[98px] rounded-2xl" />
        ))}
      </div>
      <div className={cn(CARTAO_SECAO, 'flex flex-col gap-4 border p-6')}>
        <div className={cn(bloco, 'h-3 w-2/5')} />
        <div className={cn(bloco, 'h-2 w-full')} />
        <div className={cn(bloco, 'h-3 w-1/2')} />
        <div className={cn(bloco, 'h-2 w-full')} />
      </div>
      <p className="text-muted-foreground text-xs">
        Carregando o orçamento de {mesPorExtenso(mes).split(' de ')[0]}…
      </p>
    </div>
  )
}

export function OrcamentoPage({
  mesInicial,
  hoje,
}: {
  mesInicial?: string
  hoje?: string
}) {
  const [mes, setMes] = useState(mesInicial ?? competenciaAtual())
  const [relatorio, setRelatorio] = useState<RelatorioOrcamento | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [copiando, setCopiando] = useState(false)
  // Cada abertura do editor ganha um número; salvar só fecha o editor da
  // abertura que o iniciou, nunca um reaberto (ou outro) depois.
  const [editando, setEditando] = useState<{
    categoryId: string
    sessao: number
  } | null>(null)
  const [emVoo, setEmVoo] = useState<string[]>([])
  const [errosDeRemocao, setErrosDeRemocao] = useState<Record<string, string>>(
    {},
  )
  const sessoes = useRef(0)
  const pedido = useRef(0)
  const mesAtual = useRef(mes)

  // Recarrega o mês `m` e descarta o resultado se o mês selecionado mudou
  // enquanto a mutação ou a leitura estava em voo.
  const carregarMes = useCallback(async (m: string) => {
    if (mesAtual.current !== m) return
    const meu = ++pedido.current
    const dados = await api<RelatorioOrcamento>(`/api/budgets?month=${m}`)
    if (meu === pedido.current && mesAtual.current === m) setRelatorio(dados)
  }, [])

  const iniciar = useCallback(
    (m: string) => {
      setErroCarga(null)
      carregarMes(m).catch((e: unknown) => {
        if (mesAtual.current === m)
          setErroCarga(e instanceof ApiError ? e.message : String(e))
      })
    },
    [carregarMes],
  )

  useEffect(() => {
    mesAtual.current = mes
    setRelatorio(null)
    setAviso(null)
    setCopiando(false)
    setEditando(null)
    setEmVoo([])
    setErrosDeRemocao({})
    iniciar(mes)
  }, [mes, iniciar])

  const salvar: Salvar = async (categoryId, cents) => {
    const m = mes
    const r = await mutarERecarregar(
      () =>
        api(`/api/budgets/${m}/${categoryId}`, {
          method: 'PUT',
          body: JSON.stringify({ amount_cents: cents }),
        }),
      () => carregarMes(m),
    )
    return r.ok ? null : r.mensagem
  }

  const remover: Remover = async (categoryId) => {
    const m = mes
    const r = await mutarERecarregar(
      () => api(`/api/budgets/${m}/${categoryId}`, { method: 'DELETE' }),
      () => carregarMes(m),
    )
    return r.ok ? null : r.mensagem
  }

  // O editor se fecha quando o salvar ou o remover da sua abertura termina.
  async function salvarNoEditor(
    categoryId: string,
    sessao: number,
    cents: number,
  ) {
    const erro = await salvar(categoryId, cents)
    if (!erro) setEditando((a) => (a?.sessao === sessao ? null : a))
    return erro
  }

  async function removerNoEditor(categoryId: string, sessao: number) {
    const erro = await remover(categoryId)
    if (!erro) setEditando((a) => (a?.sessao === sessao ? null : a))
    return erro
  }

  async function removerDaLinha(categoryId: string) {
    const m = mes
    setErrosDeRemocao(({ [categoryId]: _, ...resto }) => resto)
    setEmVoo((v) => [...v, categoryId])
    const erro = await remover(categoryId)
    if (mesAtual.current !== m) return
    setEmVoo((v) => v.filter((x) => x !== categoryId))
    if (erro) setErrosDeRemocao((e) => ({ ...e, [categoryId]: erro }))
  }

  async function copiar() {
    const m = mes
    setAviso(null)
    setCopiando(true)
    let resultado: { copied: number; skipped: number } | null = null
    const r = await mutarERecarregar(
      async () => {
        resultado = await api<{ copied: number; skipped: number }>(
          `/api/budgets/${m}/copy-previous`,
          { method: 'POST' },
        )
      },
      () => carregarMes(m),
    )
    if (mesAtual.current !== m) return
    const feito = resultado as { copied: number; skipped: number } | null
    setAviso(
      r.ok
        ? feito
          ? mensagemDeCopia(feito.copied, feito.skipped)
          : null
        : r.mensagem,
    )
    setCopiando(false)
  }

  const mesNome = mesPorExtenso(mes).split(' de ')[0]
  const abrirEditor = (categoryId: string) =>
    setEditando({ categoryId, sessao: ++sessoes.current })

  const barraDeAcoes = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          className="min-h-11 min-w-11"
          aria-label="Mês anterior"
          onClick={() => setMes(addMonthsToCompetence(mes, -1))}
        >
          ‹
        </Button>
        <span
          aria-live="polite"
          className="min-w-40 px-2 text-center text-sm font-semibold"
        >
          {mesPorExtenso(mes)}
        </span>
        <Button
          variant="outline"
          className="min-h-11 min-w-11"
          aria-label="Próximo mês"
          onClick={() => setMes(addMonthsToCompetence(mes, 1))}
        >
          ›
        </Button>
      </div>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={copiando}
        onClick={copiar}
      >
        Copiar do mês anterior
      </Button>
    </div>
  )

  if (erroCarga)
    return (
      <div className="flex flex-col gap-4">
        {barraDeAcoes}
        <div
          role="alert"
          className="border-destructive/25 bg-destructive/[0.07] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[18px] border px-6 py-5"
        >
          <TriangleAlert aria-hidden className="text-destructive size-5" />
          <div className="min-w-56 flex-1">
            <p className="text-destructive font-semibold">
              Não foi possível carregar o orçamento
            </p>
            <p className="text-muted-foreground text-sm">{erroCarga}</p>
          </div>
          <Button className="min-h-11" onClick={() => iniciar(mes)}>
            Tentar de novo
          </Button>
        </div>
      </div>
    )

  if (!relatorio)
    return (
      <div className="flex flex-col gap-4">
        {barraDeAcoes}
        <Carregando mes={mes} />
      </div>
    )

  const resumo = resumoDoMes(relatorio.rows)
  const marca = marcaDeHoje(mes, hoje ?? todayInTeresina())
  const estadoDoMes = estadoDoOrcamento(
    resumo.orcado_cents || null,
    resumo.gasto_cents,
  )
  const comLimite = ordenarLinhas(
    relatorio.rows.filter((l) => l.budget_cents !== null),
  )
  const semLimite = relatorio.rows
    .filter((l) => l.budget_cents === null)
    .sort((a, b) => b.spent_cents - a.spent_cents)

  const editorDe = (l: LinhaOrcamento) =>
    editando?.categoryId === l.category_id ? (
      <EditorDoLimite
        linha={l}
        mesNome={mesNome}
        onSalvar={(c) => salvarNoEditor(l.category_id, editando.sessao, c)}
        onRemover={() => removerNoEditor(l.category_id, editando.sessao)}
        onCancelar={() => setEditando(null)}
      />
    ) : null

  return (
    <div className="flex flex-col gap-4">
      {barraDeAcoes}

      {aviso ? (
        <p role="status" className="text-muted-foreground text-sm">
          {aviso}
        </p>
      ) : null}

      {relatorio.rows.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-[18px] border border-dashed px-6 py-12 text-center">
          <p className="text-base font-semibold">
            Nenhuma categoria de despesa
          </p>
          <p className="text-muted-foreground max-w-[42ch] text-sm">
            O orçamento é por categoria. Crie as suas em Categorias e volte aqui
            para definir o limite de cada uma.
          </p>
          <a
            href="#/categorias"
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-2xl px-4 text-sm font-semibold"
          >
            Ir para Categorias
          </a>
        </div>
      ) : (
        <>
          <section aria-label="Resumo do mês" className={GRID_KPI}>
            <KpiCard
              rotulo="Orçado no mês"
              valor={formatBRL(resumo.orcado_cents)}
              contexto={`${plural(resumo.com_limite_count, 'categoria', 'categorias')} com limite`}
            />
            <KpiCard
              rotulo="Gasto nas orçadas"
              valor={formatBRL(resumo.gasto_cents)}
              contexto={
                resumo.pct === null
                  ? 'defina um limite para acompanhar'
                  : `${resumo.pct}% do orçado${marca ? ` · ${marca.faltam === 1 ? 'falta 1 dia' : `faltam ${marca.faltam} dias`}` : ''}`
              }
            />
            <KpiCard
              rotulo="Ainda dá para gastar"
              valor={formatBRL(resumo.ainda_da_cents)}
              contexto="soma do que resta nas categorias dentro do limite"
            />
            <KpiCard
              rotulo="Estourado"
              valor={formatBRL(resumo.estourado_cents)}
              alerta={resumo.estourado_count > 0}
              contexto={
                resumo.estourado_count > 0
                  ? `${plural(resumo.estourado_count, 'categoria acima', 'categorias acima')} do limite`
                  : 'nenhuma categoria acima do limite'
              }
            />
          </section>

          <section
            aria-label="Uso do orçamento no mês"
            className="bg-card flex flex-col gap-3 rounded-[18px] border px-6 py-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className={ROTULO_SECAO}>Mês inteiro</p>
              {resumo.pct !== null ? (
                <p className="text-sm tabular-nums">
                  <strong>{formatBRL(resumo.gasto_cents)}</strong>{' '}
                  <span className="text-muted-foreground">
                    de {formatBRL(resumo.orcado_cents)} · {resumo.pct}%
                  </span>
                </p>
              ) : null}
            </div>
            {resumo.pct !== null ? (
              <>
                <div className="relative h-3">
                  <div
                    role="progressbar"
                    aria-label="Uso do orçamento do mês"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, resumo.pct)}
                    className={cn(TRILHO_BARRA, 'h-3')}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none',
                        COR_BARRA[estadoDoMes],
                      )}
                      style={{ width: `${Math.min(100, resumo.pct)}%` }}
                    />
                  </div>
                  {marca ? (
                    <div
                      aria-hidden
                      data-testid="marca-de-hoje"
                      className="bg-foreground/55 absolute -top-1 h-5 w-0.5"
                      style={{ left: `${marca.pct}%` }}
                    />
                  ) : null}
                </div>
                <div
                  className={cn(META_MONO, 'flex justify-between uppercase')}
                >
                  <span>1 {mesAbreviado(mes)}</span>
                  {marca ? (
                    <span>
                      hoje · dia {marca.dia} ({marca.pct}%)
                    </span>
                  ) : null}
                  <span>
                    {marca?.dias_no_mes ?? ''} {mesAbreviado(mes)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Defina um limite abaixo para acompanhar o mês.
              </p>
            )}
            {relatorio.uncategorized_spent_cents > 0 ? (
              <p className="text-muted-foreground text-xs">
                Sem categoria: {formatBRL(relatorio.uncategorized_spent_cents)}.
                Não entra no orçamento até ganhar categoria.{' '}
                <a href="#/extrato" className="text-primary font-semibold">
                  Classificar agora
                </a>
              </p>
            ) : null}
          </section>

          {comLimite.length > 0 ? (
            <section
              aria-label="Orçamento por categoria"
              className="bg-card rounded-[18px] border px-6 pt-2 pb-4"
            >
              <ul>
                {comLimite.map((l) => (
                  <LinhaDoOrcamento
                    key={l.category_id}
                    linha={l}
                    ocupado={emVoo.includes(l.category_id)}
                    erro={errosDeRemocao[l.category_id] ?? null}
                    onEditar={() => abrirEditor(l.category_id)}
                    onRemover={() => removerDaLinha(l.category_id)}
                  >
                    {editorDe(l)}
                  </LinhaDoOrcamento>
                ))}
              </ul>
            </section>
          ) : null}

          {semLimite.length > 0 ? (
            <section
              aria-label="Categorias sem orçamento"
              className="bg-card flex flex-col gap-2.5 rounded-[18px] border px-6 py-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className={ROTULO_SECAO}>Sem orçamento</p>
                <p className="text-muted-foreground text-xs">
                  gasto no mês, do maior para o menor
                </p>
              </div>
              <ul>
                {semLimite.map((l) => (
                  <li
                    key={l.category_id}
                    aria-label={`${nomeDaLinha(l)} sem orçamento`}
                    className="flex flex-col border-b last:border-b-0"
                  >
                    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 py-2">
                      <span className="text-sm font-semibold">
                        {nomeDaLinha(l)}
                      </span>
                      <span className="ml-auto text-sm whitespace-nowrap tabular-nums">
                        {formatBRL(l.spent_cents)}
                      </span>
                      {l.budgetable ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-primary min-h-9 gap-1.5 text-xs font-semibold"
                          aria-label={`Definir limite de ${nomeDaLinha(l)}`}
                          onClick={() => abrirEditor(l.category_id)}
                        >
                          <Plus aria-hidden className="size-[13px]" />
                          Definir limite
                        </Button>
                      ) : null}
                    </div>
                    {editorDe(l)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
