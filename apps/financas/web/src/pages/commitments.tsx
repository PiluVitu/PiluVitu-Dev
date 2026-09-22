import { lazy, Suspense, useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { FaixaKpi, KpiCard } from '../blocos/KpiCard'
import { CARTAO_KPI, CARTAO_SECAO } from '../lib/superficie'
import { OVERLINE, ROTULO, SUBTITULO_PAGINA } from '../lib/tipografia'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { useMenorQueSm } from '../lib/breakpoint'
import {
  formatPctRange,
  formatRange,
  LIMIAR_ALERTA_PCT,
  origensDaCompetencia,
  rotuloCompetencia,
} from '../lib/commitments'
import type { CommitmentReportView } from '../lib/commitments'

// Reusa o MESMO módulo lazy que `blocos/BlocoComprometido.tsx` carrega sob
// demanda — não uma segunda cópia do gráfico. `GraficoComprometido.tsx` é o
// único arquivo que importa `recharts` (~104 KB gzip); resolver este
// `import()` aponta pro mesmo chunk físico que o bloco da home já carrega,
// então o custo é pago uma vez só (mesmo padrão de
// `blocos/BlocoCategorias.tsx`, que faz o mesmo pra `GraficoCategorias`).
//
// ⚠️ Decisão desta migração: NÃO renderiza `<BlocoComprometido />` (o card
// autônomo da home) aqui dentro — `BlocoComprometido` busca seus PRÓPRIOS
// dados (sempre a competência ATUAL, sem props), então embutir o
// componente inteiro faria esta tela disparar um SEGUNDO fetch
// independente (com uma querystring que nem sempre bate com `from`/`months`
// recebidos por prop) só pra mostrar o mesmo gráfico — e ainda aninharia um
// segundo card "Comprometido" dentro desta página, que já tem seu próprio
// título e seus próprios estados de carregando/erro. O que de fato evita
// "duas implementações do mesmo gráfico" é o módulo `GraficoComprometido`
// em si (a peça pesada/reusável) — compartilhado aqui a partir do MESMO
// `report` que esta página já buscou, sem round-trip extra.
const GraficoComprometido = lazy(() => import('../blocos/GraficoComprometido'))

export function CommitmentsPage({
  from,
  months = 6,
}: {
  from: string
  months?: number
}) {
  const [report, setReport] = useState<CommitmentReportView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const menorQueSm = useMenorQueSm()

  useEffect(() => {
    let vivo = true
    api<CommitmentReportView>(
      `/api/reports/commitments?from=${from}&months=${months}`,
    )
      .then((data) => {
        if (vivo) setReport(data)
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [from, months])

  if (error) return <p role="alert">{error}</p>
  if (!report) return <p>Carregando…</p>

  // ⚠️ O "pior mês" é decidido pelo TETO (`max`), o mesmo critério que pinta
  // a barra e a célula de `%` — um segundo critério aqui faria a faixa de
  // KPIs e a tabela do mesmo card apontarem meses diferentes.
  //
  // ⚠️ `null` numa janela SEM competência nenhuma, e isso não é hipótese: o
  // relatório vazio (`competences: []`) é o que a rota devolve num banco
  // recém-criado, e indexar `[0]` ali lançaria no RENDER — o que derruba a
  // árvore React inteira, não só este card (a casca e a navegação iam
  // junto). Achado rodando a suíte completa.
  const pior = piorMes(report)
  // O melhor caso do PIOR mês: o que sobra do líquido fixo se toda recorrente
  // em faixa vier no piso. Nunca `max` — ali o número seria o pior caso do
  // pior mês, que a tela já mostra como `%`.
  const livreNoMelhorCaso =
    pior === null
      ? 0
      : Math.max(0, report.fixed_net_cents - report.totals[pior.indice].min)

  return (
    <section className="space-y-5" data-testid="pagina-comprometido">
      {/* O `<h1>` saiu daqui pra casca (`App.tsx`); a Ajuda ficou. */}
      <div className="flex items-start gap-2">
        <p className={SUBTITULO_PAGINA}>
          O que já está prometido dos próximos meses.
        </p>
        <Ajuda rotulo="Comprometido">
          O que já está prometido dos próximos meses: parcelas previstas +
          dívidas em aberto.
        </Ajuda>
      </div>

      <FaixaKpi>
        {pior !== null ? (
          <KpiCard
            data-testid="kpi-pior-mes"
            rotulo="Pior mês da janela"
            valor={`${formatPctRange(pior.pct)} · ${rotuloCompetencia(pior.competencia)}`}
            alerta={pior.emAlerta}
            contexto={
              pior.emAlerta
                ? `acima de ${LIMIAR_ALERTA_PCT}% do líquido fixo`
                : `dentro do limiar de ${LIMIAR_ALERTA_PCT}%`
            }
          />
        ) : null}
        <Denominador cents={report.fixed_net_cents} />
        {pior !== null ? (
          <KpiCard
            data-testid="kpi-livre"
            rotulo="Livre no melhor caso"
            valor={formatBRL(livreNoMelhorCaso)}
            contexto={`o que sobra do líquido fixo no pior mês da janela (${rotuloCompetencia(pior.competencia)}), se as recorrentes vierem no piso`}
          />
        ) : null}
      </FaixaKpi>

      {report.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma parcela ou dívida em aberto na janela.
        </p>
      ) : (
        <Card className={CARTAO_SECAO}>
          <CardContent className="space-y-3 pt-6">
            <Suspense fallback={<div aria-busy="true" />}>
              <GraficoComprometido report={report} />
            </Suspense>
            <Legenda report={report} />
          </CardContent>
        </Card>
      )}

      <Card className={CARTAO_SECAO}>
        <CardHeader>
          <CardTitle className={cn(ROTULO, 'leading-none')}>
            Por conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          {menorQueSm ? (
            /*
              ⚠️ MEDIDO em Chrome real a 390×844, com 3 contas e 6
              competências: a tabela dava `scrollWidth 524` contra
              `clientWidth 308` — 216px, ou seja METADE da janela, atrás de um
              drag horizontal sem nenhuma indicação. Três das seis
              competências e metade da linha de `%` eram INALCANÇÁVEIS pra
              quem não descobrisse o arrasto. Mesmo defeito (e mesma
              correção) de `DividasPage.tsx`: abaixo de `sm`, um card por
              competência em vez de uma coluna por competência.

              O card lidera com `%` e TOTAL porque é a pergunta da tela
              ("quanto da renda fixa já está prometido"); a quebra por conta
              vem embaixo, menor — nada da tabela se perde, só muda de eixo.
            */
            <ul className="space-y-3" data-testid="comprometido-cards">
              {report.competences.map((c, i) => {
                const total = report.totals[i]
                const pct = report.pct_of_fixed_net[i]
                // Mesmo TETO (`range.max`) e mesmo `>` da tabela — nunca uma
                // segunda regra de risco, que faria os dois markups
                // discordarem sobre o mesmo mês.
                const emAlerta = pct.max > LIMIAR_ALERTA_PCT
                return (
                  <li
                    key={c}
                    data-testid={`card-competencia-${c}`}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {rotuloCompetencia(c)}
                      </span>
                      <span
                        data-testid={`card-pct-${i}`}
                        className={cn(
                          'text-lg font-semibold tabular-nums',
                          emAlerta && 'alerta text-destructive',
                        )}
                      >
                        {formatPctRange(pct)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className={ROTULO}>TOTAL</span>
                      <span
                        data-testid={`card-total-${i}`}
                        className="font-semibold tabular-nums"
                      >
                        {formatRange(total)}
                      </span>
                    </div>
                    <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">
                      {report.rows.map((r) => (
                        <li
                          key={r.account_id}
                          className="flex justify-between gap-2"
                        >
                          <span>{r.account_name}</span>
                          <span className="tabular-nums">
                            {r.cells[i] === 0 ? '—' : formatBRL(r.cells[i])}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead data-testid="cabecalho">
                  <tr>
                    <th
                      className={cn(ROTULO, 'border-b py-1.5 pr-2 text-left')}
                    />
                    {report.competences.map((c) => (
                      <th
                        key={c}
                        className={cn(
                          ROTULO,
                          'border-b px-2 py-1.5 text-right',
                        )}
                      >
                        {rotuloCompetencia(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr
                      key={r.account_id}
                      data-testid={`linha-${r.account_id}`}
                    >
                      <td className="border-b py-1.5 pr-2 text-left">
                        {r.account_name}
                      </td>
                      {r.cells.map((cents, i) => (
                        <td
                          key={i}
                          data-testid={`celula-${r.account_id}-${i}`}
                          className="border-b px-2 py-1.5 text-right tabular-nums"
                        >
                          {cents === 0 ? '—' : formatBRL(cents)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {/*
                Fidelidade com o `tfoot th, tfoot td { border-top: 2px }`
                apagado (fix round 1, Task 9): a regra original valia pras
                DUAS linhas do tfoot (o seletor não distinguia TOTAL de %),
                e `th, td { border-bottom }` (regra geral) também alcançava
                as duas — nunca foi sobrescrita, só somada. Sem repetir
                isso aqui, o divisor entre TOTAL e % (e a borda inferior da
                tabela) sumiam silenciosamente em vez de terem sido uma
                escolha.
              */}
                <tfoot>
                  <tr>
                    <th className="border-t-2 border-b py-1.5 pr-2 text-left font-medium">
                      TOTAL
                    </th>
                    {report.totals.map((range, i) => (
                      <td
                        key={i}
                        data-testid={`total-${i}`}
                        className="border-t-2 border-b px-2 py-1.5 text-right font-medium tabular-nums"
                      >
                        {formatRange(range)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border-t-2 border-b py-1.5 pr-2 text-left font-medium">
                      % do líquido fixo
                    </th>
                    {report.pct_of_fixed_net.map((range, i) => (
                      // O alerta dispara pelo TETO (range.max), não pelo piso —
                      // §5 do spec: a tela existe pra mostrar risco, e o pior
                      // mês é o risco. Mesmo limiar/mesmo `>` (não `>=`) de
                      // sempre, só o operando mudou de "pct" (número) pra
                      // "range.max".
                      <td
                        key={i}
                        data-testid={`pct-${i}`}
                        className={cn(
                          'border-t-2 border-b px-2 py-1.5 text-right tabular-nums',
                          range.max > LIMIAR_ALERTA_PCT &&
                            'alerta text-destructive font-bold',
                        )}
                      >
                        {formatPctRange(range)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

/**
 * A competência de maior risco da janela — decidida pelo TETO da faixa,
 * nunca pelo piso (a tela existe pra mostrar risco, e o pior mês é o risco).
 * Empate resolve pela PRIMEIRA competência: a mais próxima é a que o dono
 * encara antes.
 */
function piorMes(report: CommitmentReportView) {
  if (report.pct_of_fixed_net.length === 0) return null

  let indice = 0
  report.pct_of_fixed_net.forEach((pct, i) => {
    if (pct.max > report.pct_of_fixed_net[indice].max) indice = i
  })
  const pct = report.pct_of_fixed_net[indice]
  return {
    indice,
    pct,
    competencia: report.competences[indice],
    emAlerta: pct.max > LIMIAR_ALERTA_PCT,
  }
}

/**
 * ⚠️ **Cartão próprio em vez de `KpiCard`, e não é preferência:** o valor
 * mora num `<p className="flex flex-wrap">` junto do gatilho da Ajuda —
 * `flex-wrap` é o conserto de um estouro de 12px MEDIDO a 390px, e
 * `commitments.test.tsx` sobe do `data-testid="denominador"` até o `<p>`
 * pra aferir exatamente essa classe. O `contexto` de `KpiCard` já é um
 * `<p>`, e `<p>` dentro de `<p>` é markup inválido.
 */
function Denominador({ cents }: { cents: number }) {
  return (
    <div className={CARTAO_KPI} data-testid="kpi-denominador">
      <p className={OVERLINE}>Denominador</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <strong
          data-testid="denominador"
          className="text-[28px] leading-none font-bold tracking-[-0.02em] tabular-nums"
        >
          {formatBRL(cents)}
        </strong>
        <Ajuda rotulo="Renda de referência">
          Por que o denominador é R$ 3.600 e não R$ 5.300 — o freela é volátil,
          e medir contra o mês bom esconde o risco.
        </Ajuda>
      </p>
      <p className="text-muted-foreground mt-2 text-xs leading-snug">
        líquido fixo, mês sem freela
      </p>
    </div>
  )
}

/** Piso × teto, e de onde vem o comprometido do mês mais próximo. */
function Legenda({ report }: { report: CommitmentReportView }) {
  const origens = origensDaCompetencia(report.composition?.[0])

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="bg-primary size-2.5 shrink-0 rounded-[3px]"
        />
        piso (mês bom)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="bg-primary/45 size-2.5 shrink-0 rounded-[3px]"
        />
        teto (pior mês)
      </span>
      {origens.map((o) => (
        <span key={o.chave} className="inline-flex items-baseline gap-1.5">
          <span className={OVERLINE}>{o.rotulo}</span>
          <span className="text-foreground font-semibold tabular-nums">
            {o.texto}
          </span>
        </span>
      ))}
    </div>
  )
}
