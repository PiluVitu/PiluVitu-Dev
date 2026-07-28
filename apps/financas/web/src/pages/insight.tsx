import { useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { rotuloCompetencia } from '../lib/commitments'
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
 * Fatia ⑨, Task 5 — a tela de insight. Propriedade que ela existe pra
 * sustentar (ver brief/CLAUDE.md § "Insight de IA"): **funciona sem AI**.
 * `numbers` (os fatos calculados) e `insight` (o texto gerado no Mac) são
 * buscados em DOIS `useEffect` independentes, de propósito — nunca um
 * `Promise.all` só. Se os dois estivessem no mesmo `Promise.all`, uma
 * falha (ou mesmo o caso NORMAL de "o comando nunca rodou") do lado do
 * texto derrubaria o lado dos números junto, exatamente a dependência que
 * este design existe pra evitar (o app nunca depende do Mac estar ligado).
 *
 * ⚠️ Nenhum número renderizado nesta tela vem de `insight.texto` — todo
 * valor numérico exibido é lido de `numbers` (a resposta EXATA de
 * `GET /api/insights/numbers`, que nunca lê a tabela `insights`).
 * `insight.texto` é renderizado só como PROSA, dentro de um único
 * parágrafo (`data-testid="insight-texto"`), nunca interpretado/parseado.
 */
export function InsightPage() {
  const [mes, setMes] = useState(() => competenciaAtual())

  const [numbers, setNumbers] = useState<InsightNumbersView | null>(null)
  const [numbersError, setNumbersError] = useState<string | null>(null)

  const [insight, setInsight] = useState<InsightView | null>(null)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [insightLoaded, setInsightLoaded] = useState(false)

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

  // Busca independente do bloco de números acima (ver comentário do
  // componente). Falhar aqui (rede fora, 5xx) não pode esconder os
  // números — só esconde a leitura em texto, que é exatamente o que
  // "funciona sem AI" quer dizer.
  useEffect(() => {
    let vivo = true
    api<InsightView | null>('/api/insights/latest')
      .then((data) => {
        if (vivo) {
          setInsight(data)
          setInsightLoaded(true)
        }
      })
      .catch((e: unknown) => {
        if (vivo) {
          setInsightError(e instanceof ApiError ? e.message : String(e))
          setInsightLoaded(true)
        }
      })
    return () => {
      vivo = false
    }
  }, [])

  const numbersCarregando = numbers === null && numbersError === null

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Insight</h1>
        <Ajuda rotulo="Insight">
          Os números abaixo são CALCULADOS — consulta exata contra o
          livro-caixa, disponíveis sempre, mesmo que o comando nunca tenha
          rodado no Mac. Só o texto por baixo deles é gerado por um modelo de IA
          local (Ollama), rodando no MacBook do dono — nenhum número exibido
          nesta tela vem do modelo.
        </Ajuda>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
            <span>Números de {rotuloCompetencia(mes)}</span>
            <label className="flex items-center gap-2 text-sm font-normal">
              <span className="text-muted-foreground">Mês</span>
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="border-input focus-visible:ring-ring flex h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-hidden"
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leitura</CardTitle>
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
              Nenhuma leitura foi gerada ainda. Rode{' '}
              <code className="text-foreground">make insight</code> no Mac para
              gerar uma — os números acima já funcionam sem ela, só o texto que
              falta.
            </p>
          ) : (
            <LeituraGerada insight={insight} />
          )}
        </CardContent>
      </Card>
    </section>
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
      <p>
        Total gasto:{' '}
        <strong data-testid="insight-total" className="text-foreground">
          {formatBRL(Math.abs(numbers.total_cents))}
        </strong>
      </p>

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
        <ol data-testid="insight-top-categorias" className="space-y-1">
          {numbers.top_categories.map((row, i) => (
            <li
              key={row.category_id ?? 'sem-categoria'}
              data-testid={`insight-categoria-${i}`}
            >
              {row.category_name}:{' '}
              <strong className="text-foreground">
                {formatBRL(Math.abs(row.total_cents))}
              </strong>
            </li>
          ))}
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
 * A prosa gerada no Mac + a data/idade — nunca um número novo. `antigo`
 * decide SÓ estilo/aviso, nunca esconde o texto (spec: "frescor, não
 * silêncio" — um insight velho continua visível, só não pode passar por
 * atual).
 */
function LeituraGerada({ insight }: { insight: InsightView }) {
  const dias = insightAgeDays(insight.generated_at)
  const antigo = isStaleInsight(insight.generated_at)

  return (
    <div className="space-y-2">
      <p
        data-testid="insight-geracao"
        className={cn(
          'text-sm',
          antigo ? 'text-destructive font-semibold' : 'text-muted-foreground',
        )}
      >
        Referente a {rotuloCompetencia(insight.periodo)} · gerado em{' '}
        {formatDateTimeTeresina(insight.generated_at)} ({formatInsightAge(dias)}
        )
      </p>

      {antigo ? (
        <p
          role="alert"
          data-testid="insight-alerta-desatualizado"
          className="text-destructive text-sm font-medium"
        >
          Desatualizado — gerado há mais de {STALE_THRESHOLD_DAYS} dias. Os
          números acima já podem ter mudado desde então; rode o comando no Mac
          de novo pra atualizar o texto.
        </p>
      ) : null}

      <p
        data-testid="insight-texto"
        className="text-foreground text-sm whitespace-pre-wrap"
      >
        {insight.texto}
      </p>

      <p className="text-muted-foreground text-xs">Modelo: {insight.modelo}</p>
    </div>
  )
}
