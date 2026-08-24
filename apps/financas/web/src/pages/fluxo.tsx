import { lazy, Suspense, useEffect, useState } from 'react'
import { formatBRL, sumCents } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Card, CardContent } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { NumeroCard } from '../blocos/NumeroCard'
import { useMenorQueSm } from '../lib/breakpoint'
import type { CashflowReportView } from '../lib/cashflow'
import { rotuloCompetencia } from '../lib/commitments'
import { addMonthsToCompetence, competenciaAtual } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import { ROTULO, ROTULO_SECAO } from '../lib/tipografia'

// Reusa o MESMO módulo lazy que `blocos/BlocoComprometido.tsx`/
// `blocos/BlocoCategorias.tsx` já carregam sob demanda — nunca um terceiro
// `import()` de `recharts` (~104 KB gzip). `GraficoFluxo` é uma exportação
// NOMEADA de `GraficoComprometido.tsx` (mesmo padrão que `GraficoCategorias`
// já usa); resolver este `import()` aponta pro MESMO chunk físico, então o
// custo é pago uma vez só — `scripts/check-financas-lazy-chart.mjs`
// continua válido sem alteração.
const GraficoFluxo = lazy(() =>
  import('../blocos/GraficoComprometido').then((m) => ({
    default: m.GraficoFluxo,
  })),
)

// Espelha o teto real de `cashflow()` (`src/domain/cashflow.ts`, Worker:
// `months` 1..24) — não oferecer no seletor uma janela que a rota sempre
// recusaria com 400.
const JANELAS = [6, 12, 24] as const

export function FluxoPage() {
  const [months, setMonths] = useState<number>(12)
  const [report, setReport] = useState<CashflowReportView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const menorQueSm = useMenorQueSm()

  // Padrão "N meses até o mês corrente" (spec §5) — `from` é sempre
  // recalculado a partir da janela escolhida, nunca guardado separado dela
  // (evitaria os dois ficarem dessincronizados).
  const from = addMonthsToCompetence(competenciaAtual(), -(months - 1))

  useEffect(() => {
    let vivo = true
    setError(null)
    api<CashflowReportView>(
      `/api/reports/cashflow?from=${from}&months=${months}`,
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

  // "Vazio" aqui não é `linhas` vazio — o domínio sempre devolve `months`
  // linhas, uma por mês, mesmo sem movimento (§5 do spec: "mês sem
  // movimento aparece zerado, não some"). O vazio real desta tela é TODA a
  // janela sem nenhum lançamento liquidado — só aí faz sentido substituir
  // o gráfico por uma explicação em vez de uma janela inteira de barras
  // ausentes.
  const vazio = report.linhas.every(
    (l) => l.entrou_cents === 0 && l.saiu_cents === 0,
  )

  // `sumCents` (@piluvitu/tools/money), nunca `reduce` com `+` solto — é o
  // mesmo helper que `BlocoSaldos` já usa pra somar dinheiro, e centavos são
  // INTEIROS de ponta a ponta.
  const totalEntrou = sumCents(report.linhas.map((l) => l.entrou_cents))
  const totalSaiu = sumCents(report.linhas.map((l) => l.saiu_cents))
  const totalSaldo = sumCents(report.linhas.map((l) => l.saldo_cents))

  return (
    <section className="space-y-6" data-testid="pagina-fluxo">
      {/* O `<h1>` saiu daqui pra top bar (`App.tsx`); a Ajuda ficou. */}
      <div className="flex items-center gap-3">
        <p className="text-muted-foreground text-sm">
          Entrou, saiu, saldo e acumulado, mês a mês.
        </p>
        <Ajuda rotulo="Fluxo de caixa">
          Entrou, saiu, saldo e acumulado, mês a mês — só o que já se moveu de
          verdade (lançamento liquidado). Parcela prevista é compromisso, não
          caixa; ela é assunto do Comprometido, não desta tela.
        </Ajuda>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        Janela
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className={`${SELECT_CLASSNAME} w-auto`}
        >
          {JANELAS.map((m) => (
            <option key={m} value={m}>
              {m} meses
            </option>
          ))}
        </select>
      </label>

      {/*
        ⚠️ UM número em destaque, não três. Entrou/Saiu/Saldo estavam os três
        no `<tfoot>`, no mesmo 14px de cada linha, no FIM de uma tabela que
        pode ter 24 meses — pra saber se a janela fechou no azul o dono
        rolava até o rodapé. Aqui em cima fica só o SALDO (a resposta);
        entrou/saiu viram contexto, porque o saldo já os resume, e três
        heróis lado a lado não deixariam nenhum ser herói.

        ⚠️ Mesmo `totalSaldo`/`totalEntrou`/`totalSaiu` do rodapé — uma soma
        só, nunca uma segunda. O rodapé continua existindo com outro papel
        (total POR COLUNA, alinhado à tabela); este é a manchete.

        ⚠️ Negativo em `text-destructive`, com `< 0` e nunca `<= 0`: a janela
        ZERADA não é problema, e pintá-la seria dizer que é.
      */}
      <NumeroCard
        rotulo={`Saldo dos últimos ${months} meses`}
        valorCents={totalSaldo}
        escala="heroi"
        data-testid="manchete-saldo"
        valorClassName={cn(totalSaldo < 0 && 'text-destructive')}
        contexto={`Entrou ${formatBRL(totalEntrou)} · saiu ${formatBRL(
          totalSaiu,
        )}`}
      />

      {vazio ? (
        <p className="text-muted-foreground text-sm">
          Nenhum lançamento liquidado nesta janela. Só entra aqui o que já saiu
          ou entrou de fato de uma conta — uma parcela prevista ainda não é
          caixa, é compromisso (veja em Comprometido).
        </p>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className={cn(ROTULO_SECAO, 'mb-3')}>Forma da janela</p>
            <Suspense fallback={<div aria-busy="true" />}>
              <GraficoFluxo report={report} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      {/*
        ⚠️ A tabela CONTINUA existindo, e não vira "só o gráfico": ela é a
        única prova de que um mês sem movimento aparece ZERADO em vez de
        sumir — uma barra de valor exatamente 0 não renderiza `<path>` no
        recharts (medido), então o gráfico é justamente o lugar onde um mês
        vazio é indistinguível de um mês ausente.

        O que muda: abaixo de `sm` ela colapsa pras 3 colunas que respondem a
        pergunta (mês, saldo, acumulado) em vez de espremer 5 — Entrou/Saiu
        são o detalhe de COMO o saldo se formou, e o saldo já os resume.
      */}
      <Card>
        <CardContent className="pt-6">
          {/*
            ⚠️ A HIERARQUIA é o que esta seção ganhou: manchete (a resposta) →
            gráfico (a forma) → tabela (o detalhe, e a prova). Antes o gráfico
            vinha dentro de um `Card` e a tabela logo abaixo, NUA — dois blocos
            de peso visual idêntico repetindo o mesmo dado, sem nada dizendo
            qual responde o quê nem por que os dois existem. Agora a tabela é
            um `Card` irmão com rótulo de seção (`ROTULO_SECAO`, a mesma
            assinatura em versalete mono do resto do app), o que a nomeia e a
            subordina em vez de a deixar competindo com o gráfico.

            A frase abaixo do rótulo diz POR QUE a tabela continua existindo —
            é a decisão nº 4 do "não mexer", e ela não é óbvia olhando a tela:
            uma barra de valor exatamente 0 não renderiza `<path>` no recharts
            (medido), então o gráfico é justamente o lugar onde um mês zerado é
            indistinguível de um mês ausente. A tabela é a única prova de que
            ele aparece.
          */}
          <p className={cn(ROTULO_SECAO, 'mb-1')}>Mês a mês</p>
          <p className="text-muted-foreground mb-3 text-sm">
            O detalhe por trás do gráfico — inclusive os meses sem movimento,
            que aparecem zerados aqui e não desenham barra nenhuma lá.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(ROTULO, 'border-b py-1.5 pr-2 text-left')}>
                    Mês
                  </th>
                  {!menorQueSm && (
                    <>
                      <th
                        className={cn(
                          ROTULO,
                          'border-b px-2 py-1.5 text-right',
                        )}
                      >
                        Entrou
                      </th>
                      <th
                        className={cn(
                          ROTULO,
                          'border-b px-2 py-1.5 text-right',
                        )}
                      >
                        Saiu
                      </th>
                    </>
                  )}
                  <th className={cn(ROTULO, 'border-b px-2 py-1.5 text-right')}>
                    Saldo
                  </th>
                  <th className={cn(ROTULO, 'border-b px-2 py-1.5 text-right')}>
                    Acumulado
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.linhas.map((l) => (
                  <tr key={l.competence} data-testid={`linha-${l.competence}`}>
                    {/*
                  ⚠️ `rotuloCompetencia`, nunca a competência crua: MEDIDO em
                  Chrome real, nesta MESMA tela, o eixo X do gráfico lia
                  `set/26` (ele já passava por esta função) enquanto a tabela
                  logo abaixo lia `2026-09`. Duas grafias do mesmo mês, uma
                  em cima da outra — e a ISO é a única que o dono não vê em
                  nenhuma outra tela (`#/comprometido`, `#/insight` e os
                  blocos da home já usam esta função).

                  O `data-testid` da <tr> continua sendo a competência CRUA:
                  lá é identidade, aqui é rótulo.
                */}
                    <td
                      data-testid="competencia"
                      className="border-b py-1.5 pr-2 text-left"
                    >
                      {rotuloCompetencia(l.competence)}
                    </td>
                    {!menorQueSm && (
                      <>
                        <td
                          data-testid="entrou"
                          className="border-b px-2 py-1.5 text-right tabular-nums"
                        >
                          {formatBRL(l.entrou_cents)}
                        </td>
                        <td
                          data-testid="saiu"
                          className="border-b px-2 py-1.5 text-right tabular-nums"
                        >
                          {formatBRL(l.saiu_cents)}
                        </td>
                      </>
                    )}
                    {/*
                  Mês que fechou no vermelho é a única linha que pede ação, e
                  até aqui saía com exatamente o mesmo peso das outras — o
                  sinal é a COR mais o negrito, nunca a cor sozinha (o `-` do
                  próprio valor formatado continua sendo o canal não-cromático,
                  mesma disciplina do resto do app).
                */}
                    <td
                      data-testid="saldo"
                      className={cn(
                        'border-b px-2 py-1.5 text-right tabular-nums',
                        l.saldo_cents < 0 && 'text-destructive font-semibold',
                      )}
                    >
                      {formatBRL(l.saldo_cents)}
                    </td>
                    <td
                      data-testid="acumulado"
                      className="border-b px-2 py-1.5 text-right font-medium tabular-nums"
                    >
                      {formatBRL(l.acumulado_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr data-testid="linha-total">
                  <th className="border-t-2 border-b py-1.5 pr-2 text-left font-medium">
                    TOTAL
                  </th>
                  {!menorQueSm && (
                    <>
                      <td
                        data-testid="total-entrou"
                        className="border-t-2 border-b px-2 py-1.5 text-right font-medium tabular-nums"
                      >
                        {formatBRL(totalEntrou)}
                      </td>
                      <td
                        data-testid="total-saiu"
                        className="border-t-2 border-b px-2 py-1.5 text-right font-medium tabular-nums"
                      >
                        {formatBRL(totalSaiu)}
                      </td>
                    </>
                  )}
                  <td
                    data-testid="total-saldo"
                    className={cn(
                      'border-t-2 border-b px-2 py-1.5 text-right font-medium tabular-nums',
                      totalSaldo < 0 && 'text-destructive font-semibold',
                    )}
                  >
                    {formatBRL(totalSaldo)}
                  </td>
                  {/*
                Acumulado NÃO é somado: ele já é um saldo corrente, e somar
                saldos correntes não significa nada (daria "o dinheiro contado
                N vezes"). O valor final da janela já está na última linha da
                tabela, logo acima — repeti-lo aqui como se fosse um total
                convidaria exatamente a essa leitura errada.
              */}
                  <td
                    data-testid="total-acumulado"
                    className="text-muted-foreground border-t-2 border-b px-2 py-1.5 text-right"
                  >
                    —
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
