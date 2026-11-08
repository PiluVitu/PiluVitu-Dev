import { useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { cn } from '@piluvitu/ui/cn'
import { ApiError } from '../api'
import { rotuloCompetencia } from '../lib/commitments'
import { competenciaAtual } from '../lib/dates'
import {
  estadoDoOrcamento,
  larguraDaBarra,
  ordenarLinhas,
  percentualUsado,
  resumoDoMes,
  type EstadoOrcamento,
  type RelatorioOrcamento,
} from '../lib/orcamento'
import { buscarUmaVez } from '../lib/requisicao-unica'
import { TRILHO_BARRA } from '../lib/superficie'
import { ALVO_LINK } from '../lib/touch'
import { Bloco } from './Bloco'

const LINHAS_NO_BLOCO = 4

const COR_BARRA: Record<EstadoOrcamento, string> = {
  estourado: 'bg-destructive',
  atencao: 'bg-warn',
  dentro: 'bg-primary',
  sem_orcamento: 'bg-primary',
}
const COR_TEXTO: Record<EstadoOrcamento, string> = {
  estourado: 'text-destructive',
  atencao: 'text-warn',
  dentro: 'text-muted-foreground',
  sem_orcamento: 'text-muted-foreground',
}

/** O corpo do bloco, sem busca nem moldura: as stories e o teste usam direto. */
export function ConteudoOrcamento({
  relatorio,
}: {
  relatorio: RelatorioOrcamento
}) {
  const resumo = resumoDoMes(relatorio.rows)
  const estadoDoMes = estadoDoOrcamento(
    resumo.orcado_cents || null,
    resumo.gasto_cents,
  )
  const linhas = ordenarLinhas(
    relatorio.rows.filter((l) => l.budget_cents !== null),
  ).slice(0, LINHAS_NO_BLOCO)
  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="progressbar"
        aria-label="Uso do orçamento do mês"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, resumo.pct ?? 0)}
        className={cn(TRILHO_BARRA, 'h-2.5')}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none',
            COR_BARRA[estadoDoMes],
          )}
          style={{ width: `${Math.min(100, resumo.pct ?? 0)}%` }}
        />
      </div>
      <ul className="flex flex-col gap-2">
        {linhas.map((l) => {
          const estado = estadoDoOrcamento(l.budget_cents, l.spent_cents)
          const pct = percentualUsado(l.budget_cents, l.spent_cents) ?? 0
          return (
            <li
              key={l.category_id}
              className="grid grid-cols-[88px_1fr_44px] items-center gap-2.5 text-xs"
            >
              <span className="truncate font-semibold">{l.category_name}</span>
              <span aria-hidden className={cn(TRILHO_BARRA, 'block h-1.5')}>
                <span
                  className={cn('block h-full rounded-full', COR_BARRA[estado])}
                  style={{
                    width: `${larguraDaBarra(l.budget_cents, l.spent_cents)}%`,
                  }}
                />
              </span>
              <span
                className={cn(
                  'text-right font-mono text-[10px] font-semibold',
                  COR_TEXTO[estado],
                )}
              >
                {pct}%
              </span>
            </li>
          )
        })}
      </ul>
      <a
        href="#/orcamento"
        className={cn(ALVO_LINK, 'text-primary text-[13px] font-semibold')}
      >
        Ver o orçamento →
      </a>
    </div>
  )
}

export function BlocoOrcamento() {
  const mes = competenciaAtual()
  const [relatorio, setRelatorio] = useState<RelatorioOrcamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    buscarUmaVez<RelatorioOrcamento>(`/api/budgets?month=${mes}`)
      .then((data) => {
        if (vivo) setRelatorio(data)
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [mes])

  const resumo = relatorio ? resumoDoMes(relatorio.rows) : null
  const vazio = resumo !== null && resumo.com_limite_count === 0
  const atencao = relatorio
    ? relatorio.rows.filter(
        (l) => estadoDoOrcamento(l.budget_cents, l.spent_cents) === 'atencao',
      ).length
    : 0
  const chip =
    resumo && resumo.estourado_count > 0
      ? {
          texto: `${resumo.estourado_count} ${resumo.estourado_count === 1 ? 'estourada' : 'estouradas'}`,
          classe: 'text-destructive border-destructive bg-destructive/[0.08]',
        }
      : atencao > 0
        ? {
            texto: `${atencao} em atenção`,
            classe: 'text-warn border-warn bg-warn/10',
          }
        : null

  return (
    <Bloco
      titulo="Orçamento"
      descricao={
        resumo && !vazio
          ? `${rotuloCompetencia(mes)} · ${formatBRL(resumo.gasto_cents)} de ${formatBRL(resumo.orcado_cents)}`
          : rotuloCompetencia(mes)
      }
      acao={
        vazio ? (
          <a
            href="#/orcamento"
            className={cn(ALVO_LINK, 'text-primary text-[13px] font-semibold')}
          >
            Definir limites
          </a>
        ) : chip ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase',
              chip.classe,
            )}
          >
            {chip.texto}
          </span>
        ) : undefined
      }
      carregando={relatorio === null && erro === null}
      erro={erro}
      vazio={vazio}
      vazioMensagem="Nenhum limite definido neste mês."
    >
      {relatorio ? <ConteudoOrcamento relatorio={relatorio} /> : null}
    </Bloco>
  )
}
