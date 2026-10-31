import { useEffect, useRef, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { rotuloCompetencia } from '../lib/commitments'
import { CARTAO_SECAO, PAINEL_SUNKEN } from '../lib/superficie'
import { NUMERO_HEROI, ROTULO, SUBTITULO_PAGINA } from '../lib/tipografia'
import { competenciaAtual, formatDateTimeTeresina } from '../lib/dates'
import {
  formatInsightAge,
  insightAgeDays,
  isStaleInsight,
  STALE_THRESHOLD_DAYS,
  type InsightNumbersView,
  type InsightView,
} from '../lib/insight'

/**
 * A tela de insight funciona sem IA: `numbers` (os fatos calculados) e
 * `insight` (o texto da Claude) vêm de dois `useEffect` independentes, nunca
 * de um `Promise.all`, para que a falha de um lado não esconda o outro.
 * Nenhum número exibido sai de `insight.texto`, que é só prosa.
 */
export function InsightPage() {
  const [mes, setMes] = useState(() => competenciaAtual())

  const [numbers, setNumbers] = useState<InsightNumbersView | null>(null)
  const [numbersError, setNumbersError] = useState<string | null>(null)

  const [insight, setInsight] = useState<InsightView | null>(null)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [insightLoaded, setInsightLoaded] = useState(false)

  const [gerando, setGerando] = useState(false)
  const [geracaoErro, setGeracaoErro] = useState<string | null>(null)

  // Guarda síncrona: dois cliques no mesmo tick, antes do `disabled` chegar
  // ao DOM, custariam duas chamadas pagas à Claude.
  const gerandoRef = useRef(false)
  const vivoRef = useRef(true)
  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
    }
  }, [])

  useEffect(() => {
    let vivo = true
    setNumbers(null)
    setNumbersError(null)
    api<InsightNumbersView>(`/api/insights/numbers?competence=${mes}`)
      .then((data) => {
        if (vivo) setNumbers(data)
      })
      .catch((e: unknown) => {
        if (vivo) {
          setNumbersError(e instanceof ApiError ? e.message : String(e))
        }
      })
    return () => {
      vivo = false
    }
  }, [mes])

  useEffect(() => {
    api<InsightView | null>('/api/insights/latest')
      .then((data) => {
        if (!vivoRef.current) return
        setInsight(data)
        setInsightLoaded(true)
      })
      .catch((e: unknown) => {
        if (!vivoRef.current) return
        setInsightError(e instanceof ApiError ? e.message : String(e))
        setInsightLoaded(true)
      })
  }, [])

  async function gerar(): Promise<void> {
    if (gerandoRef.current) return
    gerandoRef.current = true
    setGerando(true)
    setGeracaoErro(null)

    try {
      const novo = await api<InsightView>('/api/insights/generate', {
        method: 'POST',
        body: JSON.stringify({ competence: mes }),
      })
      if (!vivoRef.current) return
      setInsight(novo)
      setInsightError(null)
      setInsightLoaded(true)
    } catch (e: unknown) {
      if (!vivoRef.current) return
      setGeracaoErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      gerandoRef.current = false
      if (vivoRef.current) setGerando(false)
    }
  }

  const numbersCarregando = numbers === null && numbersError === null

  return (
    <section className="space-y-5" data-testid="pagina-insight">
      {/* `flex-wrap`: medido a 390px, sem ele o gatilho da Ajuda sai da caixa. */}
      <div className="flex flex-wrap items-center gap-3">
        <p className={SUBTITULO_PAGINA}>
          Os números do mês, mais a leitura escrita pela Claude.
        </p>
        <Ajuda rotulo="Insight">
          Os números abaixo são CALCULADOS — consulta exata contra o
          livro-caixa, disponíveis sempre. Só o texto por baixo deles é escrito
          pela Claude, a partir de só os totais do mês (nenhum lançamento,
          descrição ou favorecido sai daqui) — nenhum número exibido nesta tela
          vem do modelo. Todo dia 1 o texto do mês que fechou é gerado sozinho.
        </Ajuda>
      </div>

      <Card className={CARTAO_SECAO}>
        <CardHeader>
          <CardTitle
            className={cn(
              ROTULO,
              'flex flex-wrap items-center justify-between gap-3',
            )}
          >
            <span>Números de {rotuloCompetencia(mes)}</span>
            <label className="flex items-center gap-2 text-sm font-normal">
              <span className="text-muted-foreground">Mês</span>
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="border-input focus-visible:ring-ring flex h-[34px] rounded-[10px] border bg-transparent px-2.5 text-xs shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-hidden"
              />
            </label>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {numbersError ? (
            <p role="alert" className="text-destructive text-sm">
              {numbersError}
            </p>
          ) : numbersCarregando ? (
            <p aria-busy="true" className="text-muted-foreground text-sm">
              Carregando…
            </p>
          ) : numbers ? (
            <NumerosCalculados numbers={numbers} />
          ) : null}
        </CardContent>
      </Card>

      <CartaoLeitura
        mes={mes}
        insight={insight}
        insightError={insightError}
        insightLoaded={insightLoaded}
        gerando={gerando}
        geracaoErro={geracaoErro}
        onGerar={() => {
          void gerar()
        }}
      />
    </section>
  )
}

export type CartaoLeituraProps = {
  /** O mês que o botão gera: o do seletor, que pode não ser o da leitura. */
  mes: string
  insight: InsightView | null
  insightError: string | null
  insightLoaded: boolean
  gerando: boolean
  geracaoErro: string | null
  onGerar: () => void
}

export function CartaoLeitura({
  mes,
  insight,
  insightError,
  insightLoaded,
  gerando,
  geracaoErro,
  onGerar,
}: CartaoLeituraProps) {
  return (
    <Card className={CARTAO_SECAO}>
      <CardHeader>
        <CardTitle className={cn(ROTULO, 'leading-none')}>Leitura</CardTitle>
      </CardHeader>
      <CardContent>
        {insightError ? (
          <p role="alert" className="text-destructive text-sm">
            {insightError}
          </p>
        ) : !insightLoaded ? (
          <p aria-busy="true" className="text-muted-foreground text-sm">
            Carregando…
          </p>
        ) : insight === null ? (
          <p
            data-testid="sem-insight"
            className="text-muted-foreground text-sm"
          >
            Nenhuma leitura foi gerada ainda. Use o botão abaixo, ou espere o
            dia 1, quando o texto do mês que fechou é gerado sozinho. Os números
            acima já funcionam sem ele, só o texto que falta.
          </p>
        ) : (
          <LeituraGerada insight={insight} />
        )}

        {/* Fora da cadeia acima: é o único jeito de sair do erro de leitura sem trocar de tela. */}
        <div className="mt-4 space-y-2 border-t pt-4">
          <Button
            type="button"
            data-testid="botao-gerar"
            disabled={gerando || !insightLoaded}
            onClick={onGerar}
          >
            {gerando
              ? 'Gerando…'
              : `Gerar insight de ${rotuloCompetencia(mes)}`}
          </Button>

          {gerando ? (
            <p
              role="status"
              aria-busy="true"
              data-testid="gerando-status"
              className="text-muted-foreground text-sm"
            >
              Gerando a leitura do mês…
            </p>
          ) : null}

          {geracaoErro ? (
            <p
              role="alert"
              data-testid="geracao-erro"
              className="text-destructive text-sm"
            >
              {geracaoErro}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Só valores de `numbers` — nunca de `insight.texto`. `Math.abs(...)`
 * porque `total_cents`/categorias chegam com o sinal cru de `byCategory`
 * (negativo, despesa) — "gastei -R$ 900,00" é confuso numa tela sobre
 * quanto saiu, mesma convenção de `BlocoCategorias.tsx`.
 */
function NumerosCalculados({ numbers }: { numbers: InsightNumbersView }) {
  return (
    <div className="space-y-3 text-sm">
      {/*
        ⚠️ Era um `<strong>` de 14px no meio da frase "Total gasto: X" — o
        número que a tela existe pra explicar com o mesmo peso do rótulo que
        o nomeia. Virou manchete: `ROTULO` (versalete mono, a assinatura do
        admin) + `NUMERO_HEROI` (30px).

        ⚠️ NÃO virou `NumeroCard`: ele é um `Card`, e isto vive DENTRO do
        card "Números de <mês>", cujo cabeçalho carrega o seletor que define
        qual mês está sendo somado. Card dentro de Card aqui seria moldura
        sobre moldura; tirar o número pra fora o colocaria ACIMA do controle
        que o governa. O que se reusa é a tipografia — que é onde mora a
        linguagem.
      */}
      <div>
        <p className={ROTULO}>Total gasto</p>
        <p data-testid="insight-total" className={cn('mt-1', NUMERO_HEROI)}>
          {formatBRL(Math.abs(numbers.total_cents))}
        </p>
      </div>

      <p data-testid="insight-variacao">
        {numbers.variation_pct === null ? (
          <>
            Sem base de comparação: não houve gasto registrado em{' '}
            {rotuloCompetencia(numbers.previous_competence)}.
          </>
        ) : (
          <>
            {numbers.variation_cents >= 0 ? 'Aumento' : 'Redução'} de{' '}
            <strong className="text-foreground">
              {formatBRL(Math.abs(numbers.variation_cents))} (
              {Math.abs(numbers.variation_pct)}%)
            </strong>{' '}
            em relação a {rotuloCompetencia(numbers.previous_competence)}.
          </>
        )}
      </p>

      {numbers.top_categories.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum gasto em {rotuloCompetencia(numbers.competence)}.
        </p>
      ) : (
        /*
          ⚠️ Barra de proporção, e ela é um `<div>` com `style.width` — NUNCA
          um gráfico. `GraficoComprometido.tsx` é o ÚNICO importador de
          `recharts` no app, e um arquivo novo de gráfico custaria **+113 KB
          gzip** num segundo chunk que `scripts/check-financas-lazy-chart.mjs`
          NÃO pegaria (ele checa que o marcador está fora do chunk de entrada e
          dentro de algum chunk lazy, não quantos existem). Aqui não há
          biblioteca nenhuma: dois `<div>`s e uma porcentagem, custo de bundle
          ZERO.

          O problema que ela resolve: cinco valores empilhados em texto não
          dizem PROPORÇÃO. "R$ 1.234.567,89" e "R$ 617.283,94" lado a lado
          exigem que o dono divida de cabeça pra ver que o primeiro é o dobro
          do segundo — que é a única pergunta que uma lista "top categorias"
          existe pra responder.

          ⚠️ A base é o TOTAL do mês (`numbers.total_cents`), não a maior
          categoria. Com a maior como 100%, a primeira barra estaria sempre
          cheia e a leitura viraria "DAS é o maior" (que a ordem já diz);
          contra o total, ela diz "DAS é 55% do mês", que é informação nova. A
          soma das barras nunca passa de 100% porque `top_categories` é um
          subconjunto do que compõe `total_cents`.

          ⚠️ Nada disto sai de `insight.texto` — a porcentagem é aritmética
          sobre dois campos de `numbers` (`row.total_cents` e
          `total_cents`), mesma origem do resto da tela. `Math.abs` porque os
          dois chegam com o sinal cru de `byCategory` (negativo).
        */
        <ol data-testid="insight-top-categorias" className="space-y-2">
          {numbers.top_categories.map((row, i) => {
            const totalMes = Math.abs(numbers.total_cents)
            const valor = Math.abs(row.total_cents)
            // Guarda contra divisão por zero: um mês cujo total fecha em 0
            // (estorno anulando o gasto) não tem proporção que signifique
            // alguma coisa — a barra some, os valores ficam.
            const pct =
              totalMes === 0 ? null : Math.round((valor * 100) / totalMes)
            return (
              <li
                key={row.category_id ?? 'sem-categoria'}
                data-testid={`insight-categoria-${i}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span>{row.category_name}</span>
                  <strong className="text-foreground whitespace-nowrap tabular-nums">
                    {formatBRL(valor)}
                  </strong>
                </div>
                {pct === null ? null : (
                  <div
                    className="bg-secondary mt-1.5 h-[7px] w-full overflow-hidden rounded-full"
                    // A barra é decoração de um número que já está escrito ao
                    // lado — anunciá-la de novo só repetiria a mesma
                    // informação pra quem usa leitor de tela.
                    aria-hidden="true"
                    data-testid={`insight-barra-${i}`}
                    data-pct={pct}
                  >
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {numbers.biggest_increase ? (
        <p data-testid="insight-maior-crescimento">
          O que mais cresceu:{' '}
          <strong className="text-foreground">
            {numbers.biggest_increase.category_name}
          </strong>{' '}
          — de {formatBRL(Math.abs(numbers.biggest_increase.previous_cents))}{' '}
          para {formatBRL(Math.abs(numbers.biggest_increase.current_cents))}.
        </p>
      ) : null}
    </div>
  )
}

/**
 * A prosa gerada pela Claude + a data/idade — nunca um número novo. `antigo`
 * decide SÓ estilo/aviso, nunca esconde o texto (spec: "frescor, não
 * silêncio" — um insight velho continua visível, só não pode passar por
 * atual).
 */
function LeituraGerada({ insight }: { insight: InsightView }) {
  const dias = insightAgeDays(insight.generated_at)
  const antigo = isStaleInsight(insight)
  const periodo = rotuloCompetencia(insight.periodo)

  return (
    <div className="space-y-2">
      <p
        data-testid="insight-geracao"
        className={cn(
          'text-sm',
          antigo ? 'text-destructive font-semibold' : 'text-muted-foreground',
        )}
      >
        Referente a {periodo} · gerado em{' '}
        {formatDateTimeTeresina(insight.generated_at)} ({formatInsightAge(dias)}
        )
      </p>

      {antigo ? (
        <p
          role="alert"
          data-testid="insight-alerta-desatualizado"
          className="text-destructive text-sm font-medium"
        >
          Desatualizado — gerado antes de {periodo} fechar, há mais de{' '}
          {STALE_THRESHOLD_DAYS} dias. Os gastos de {periodo} podem ter mudado
          desde então; escolha {periodo} no seletor acima e use o botão abaixo
          pra gerar o texto de novo.
        </p>
      ) : null}

      {/* O texto do modelo num painel rebaixado: a superfície diz "isto veio
          de fora do livro-caixa" sem precisar de mais uma frase de aviso. */}
      <p
        data-testid="insight-texto"
        className={cn(
          PAINEL_SUNKEN,
          'text-foreground text-sm leading-relaxed whitespace-pre-wrap',
        )}
      >
        {insight.texto}
      </p>

      <p className="text-muted-foreground text-xs">Modelo: {insight.modelo}</p>
    </div>
  )
}
