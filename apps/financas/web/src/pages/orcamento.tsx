import { useCallback, useEffect, useRef, useState } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { api, ApiError } from '../api'
import { addMonthsToCompetence, competenciaAtual } from '../lib/dates'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import {
  estadoDoOrcamento,
  larguraDaBarra,
  mesPorExtenso,
  ordenarLinhas,
  percentualUsado,
  type LinhaOrcamento,
  type RelatorioOrcamento,
} from '../lib/orcamento'
import {
  CARTAO_SECAO,
  CHIP_MONO,
  FAIXA_ALERTA,
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

export function LinhaDoOrcamento({
  linha,
  onSalvar,
  onRemover,
}: {
  linha: LinhaOrcamento
  onSalvar: Salvar
  onRemover: Remover
}) {
  const { budget_cents: orcado, spent_cents: gasto } = linha
  const [rascunho, setRascunho] = useState(
    orcado === null ? '' : formatBRL(orcado),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const estado = estadoDoOrcamento(orcado, gasto)
  const pct = percentualUsado(orcado, gasto)
  const nome = linha.parent_name
    ? `${linha.parent_name} › ${linha.category_name}`
    : linha.category_name

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    let cents: number
    try {
      cents = parseBRL(rascunho)
    } catch {
      setErro('Digite um valor em reais, como 250,00.')
      return
    }
    if (cents <= 0) {
      setErro('O valor precisa ser maior que zero.')
      return
    }
    setOcupado(true)
    setErro(await onSalvar(linha.category_id, cents))
    setOcupado(false)
  }

  async function remover() {
    setErro(null)
    setOcupado(true)
    setErro(await onRemover(linha.category_id))
    setOcupado(false)
  }

  const botaoRemover =
    orcado !== null ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11"
        disabled={ocupado}
        onClick={remover}
      >
        Remover
      </Button>
    ) : null

  return (
    <li
      aria-label={nome}
      className="flex flex-col gap-2 border-b py-3 last:border-b-0 last:pb-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">{nome}</span>
        <span className="text-sm tabular-nums">
          {formatBRL(gasto)}
          {orcado !== null ? (
            <span className="text-muted-foreground">
              {' '}
              de {formatBRL(orcado)}
            </span>
          ) : null}
        </span>
      </div>

      {orcado !== null ? (
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={`Uso do orçamento de ${nome}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, pct ?? 0)}
            className={cn(TRILHO_BARRA, 'h-2')}
          >
            <div
              className={cn(
                'h-full rounded-full',
                estado === 'estourado' ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${larguraDaBarra(orcado, gasto)}%` }}
            />
          </div>
          <span className={cn(META_MONO, 'w-12 shrink-0 text-right')}>
            {pct}%
          </span>
          {estado === 'estourado' ? (
            <span
              className={cn(
                CHIP_MONO,
                'text-destructive border-destructive/40',
              )}
            >
              Estourado
            </span>
          ) : null}
        </div>
      ) : null}

      {estado === 'estourado' && orcado !== null ? (
        <p className="text-destructive text-xs">
          {formatBRL(gasto - orcado)} acima do orçamento
        </p>
      ) : null}

      {linha.budgetable ? (
        <form onSubmit={salvar} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`Orçamento de ${linha.category_name}`}
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            className="h-11 w-36"
          />
          <Button
            type="submit"
            size="sm"
            className="min-h-11"
            disabled={ocupado}
          >
            Salvar
          </Button>
          {botaoRemover}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">
            Categoria arquivada ou que não é de despesa: não aceita novo
            orçamento.
          </p>
          {botaoRemover}
        </div>
      )}
      {erro ? (
        <p role="alert" className={FAIXA_ALERTA}>
          {erro}
        </p>
      ) : null}
    </li>
  )
}

export function OrcamentoPage({ mesInicial }: { mesInicial?: string }) {
  const [mes, setMes] = useState(mesInicial ?? competenciaAtual())
  const [relatorio, setRelatorio] = useState<RelatorioOrcamento | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [copiando, setCopiando] = useState(false)
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

  useEffect(() => {
    mesAtual.current = mes
    setRelatorio(null)
    setErroCarga(null)
    setAviso(null)
    setCopiando(false)
    carregarMes(mes).catch((e: unknown) => {
      if (mesAtual.current === mes)
        setErroCarga(e instanceof ApiError ? e.message : String(e))
    })
  }, [mes, carregarMes])

  const salvar: Salvar = async (categoryId, cents) => {
    const r = await mutarERecarregar(
      () =>
        api(`/api/budgets/${mes}/${categoryId}`, {
          method: 'PUT',
          body: JSON.stringify({ amount_cents: cents }),
        }),
      () => carregarMes(mes),
    )
    return r.ok ? null : r.mensagem
  }

  const remover: Remover = async (categoryId) => {
    const r = await mutarERecarregar(
      () => api(`/api/budgets/${mes}/${categoryId}`, { method: 'DELETE' }),
      () => carregarMes(mes),
    )
    return r.ok ? null : r.mensagem
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
    setAviso(
      r.ok && resultado
        ? mensagemDeCopia(
            (resultado as { copied: number }).copied,
            (resultado as { skipped: number }).skipped,
          )
        : r.ok
          ? null
          : r.mensagem,
    )
    setCopiando(false)
  }

  if (erroCarga) return <p role="alert">{erroCarga}</p>

  const resumo = relatorio
  const pctTotal = resumo
    ? percentualUsado(
        resumo.total_budget_cents || null,
        resumo.budgeted_spent_cents,
      )
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
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
            size="sm"
            className="min-h-11 min-w-11"
            aria-label="Próximo mês"
            onClick={() => setMes(addMonthsToCompetence(mes, 1))}
          >
            ›
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={copiando}
          onClick={copiar}
        >
          Copiar do mês anterior
        </Button>
      </div>

      {aviso ? (
        <p role="status" className="text-muted-foreground text-sm">
          {aviso}
        </p>
      ) : null}

      {!resumo ? (
        <p>Carregando…</p>
      ) : (
        <>
          <section aria-label="Resumo do mês">
            <Card className={CARTAO_SECAO}>
              <CardContent className="flex flex-col gap-2 pt-6">
                <p className={ROTULO_SECAO}>Orçado no mês</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatBRL(resumo.total_budget_cents)}
                </p>
                <p className="text-muted-foreground text-sm tabular-nums">
                  Gasto nas categorias orçadas:{' '}
                  {formatBRL(resumo.budgeted_spent_cents)}
                  {pctTotal !== null ? ` (${pctTotal}%)` : ''}
                </p>
                {resumo.uncategorized_spent_cents > 0 ? (
                  <p className="text-muted-foreground text-xs tabular-nums">
                    Sem categoria: {formatBRL(resumo.uncategorized_spent_cents)}{' '}
                    (não entra no orçamento)
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </section>

          {resumo.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma categoria de despesa cadastrada. Crie uma em Categorias
              para definir o orçamento.
            </p>
          ) : (
            <Card className={CARTAO_SECAO}>
              <CardContent className="pt-6">
                <ul>
                  {ordenarLinhas(resumo.rows).map((l) => (
                    <LinhaDoOrcamento
                      key={`${l.category_id}-${l.budget_cents}`}
                      linha={l}
                      onSalvar={salvar}
                      onRemover={remover}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
