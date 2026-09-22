import { useEffect, useState } from 'react'
import { formatBRL, sumCents } from '@piluvitu/tools/money'
import { competenciaAtual } from '../lib/dates'
import { buscarUmaVez } from '../lib/requisicao-unica'
import {
  formatPctRange,
  LIMIAR_ALERTA_PCT,
  rotuloCompetencia,
} from '../lib/commitments'
import type { CommitmentReportView } from '../lib/commitments'
import type { EmergencyStatusView } from '../lib/reserve'
import { abaixoDaMeta, formatMeses } from '../lib/reserve'
import type { InsightNumbersView } from '../lib/insight'
import type { DebtProgressView } from './BlocoDividas'
import { FaixaKpi, KpiCard } from './KpiCard'

const MESES = 6

/**
 * A régua que abre a home: os quatro números que respondem "como eu estou"
 * antes de qualquer detalhe.
 *
 * ⚠️ **Nenhuma rota nova, e nenhuma requisição nova.** Os quatro números
 * saem das MESMAS rotas que os quatro blocos abaixo já buscam; o que torna
 * isso de graça é `buscarUmaVez` (`lib/requisicao-unica.ts`), que junta as
 * chamadas concorrentes ao mesmo `path` numa só.
 *
 * ⚠️ **Falha em SILÊNCIO — nenhum `role="alert"` sai daqui.** Cada bloco
 * abaixo já mostra o próprio erro, contido no próprio card; um segundo
 * alerta sobre a mesma rota que falhou seria a mesma notícia duas vezes, e
 * `home.test.tsx` conta os alertas da tela justamente pra travar isso.
 * Precedente do módulo: as referências de `BlocoSaldos` e `BlocoCategorias`
 * degradam do mesmo jeito.
 */
/**
 * ⚠️ **Número ausente vira '—', nunca `R$ 0,00`.** `formatBRL` LANÇA
 * `RangeError` em `NaN` (packages/tools/money.ts), e o card fica dentro da
 * árvore do App: um payload sem o campo derrubava a tela inteira em branco,
 * não só este card — MEDIDO quando `total_pf_cents` entrou e as fixtures
 * ainda não tinham o campo. Cair para zero seria pior que a tela branca: um
 * gasto de verdade apareceria como "não gastei nada".
 */
function valorOuTraco(cents: number | undefined): string {
  return cents !== undefined && Number.isSafeInteger(cents)
    ? formatBRL(Math.abs(cents))
    : '—'
}

export function FaixaKpiInicio() {
  const mes = competenciaAtual()
  const [comprometido, setComprometido] = useState<CommitmentReportView | null>(
    null,
  )
  const [numeros, setNumeros] = useState<InsightNumbersView | null>(null)
  const [dividas, setDividas] = useState<DebtProgressView[] | null>(null)
  const [reserva, setReserva] = useState<EmergencyStatusView | null>(null)

  useEffect(() => {
    let vivo = true
    const guardar =
      <T,>(set: (v: T | null) => void) =>
      (v: T) => {
        if (vivo) set(v)
      }
    const silenciar = <T,>(set: (v: T | null) => void) => {
      return () => {
        if (vivo) set(null)
      }
    }

    buscarUmaVez<CommitmentReportView>(
      `/api/reports/commitments?from=${mes}&months=${MESES}`,
    )
      .then(guardar(setComprometido))
      .catch(silenciar(setComprometido))
    buscarUmaVez<InsightNumbersView>(`/api/insights/numbers?competence=${mes}`)
      .then(guardar(setNumeros))
      .catch(silenciar(setNumeros))
    buscarUmaVez<DebtProgressView[]>('/api/debts?status=open&direction=i_owe')
      .then(guardar(setDividas))
      .catch(silenciar(setDividas))
    buscarUmaVez<EmergencyStatusView>('/api/reserve')
      .then(guardar(setReserva))
      .catch(silenciar(setReserva))

    return () => {
      vivo = false
    }
  }, [mes])

  const pct = comprometido?.pct_of_fixed_net[0] ?? null
  const totalDevido = dividas
    ? sumCents(dividas.map((d) => d.remaining_cents))
    : null
  const emAberto = dividas
    ? dividas.filter((d) => d.remaining_cents > 0).length
    : 0

  return (
    <FaixaKpi data-testid="faixa-kpi-inicio">
      <KpiCard
        data-testid="kpi-comprometido"
        rotulo="Comprometido"
        valor={pct ? formatPctRange(pct) : '—'}
        // ⚠️ O alerta olha o TETO (`max`), nunca o piso — é a mesma decisão
        // já provada no resto do Comprometido: a tela existe pra mostrar
        // RISCO, e o pior mês é o risco.
        alerta={pct !== null && pct.max > LIMIAR_ALERTA_PCT}
        contexto={
          pct === null
            ? 'sem dado ainda'
            : pct.max > LIMIAR_ALERTA_PCT
              ? `acima de ${LIMIAR_ALERTA_PCT}% da renda fixa em ${rotuloCompetencia(mes)}`
              : `da renda fixa em ${rotuloCompetencia(mes)}`
        }
      />
      <KpiCard
        data-testid="kpi-gasto"
        rotulo={`Gasto em ${rotuloCompetencia(mes)}`}
        valor={valorOuTraco(numeros?.total_pf_cents)}
        contexto={<GastoContexto numeros={numeros} />}
      />
      <KpiCard
        data-testid="kpi-devo"
        rotulo="Total que devo"
        valor={totalDevido === null ? '—' : formatBRL(totalDevido)}
        contexto={
          totalDevido === null
            ? 'sem dado ainda'
            : `${emAberto} dívida(s) em aberto · o que me devem não entra nesta soma`
        }
      />
      <KpiCard
        data-testid="kpi-reserva"
        rotulo="Reserva"
        valor={reserva?.meses ? formatMeses(reserva.meses) : '—'}
        // ⚠️ Aqui o alerta olha o PISO (`min`), a INVERSÃO em relação ao
        // Comprometido logo ao lado: no comprometido o teto é o perigo
        // (gasto máximo), na reserva o piso é (sobrevivência mínima).
        // `abaixoDaMeta` é a mesma função que `#/reserva` usa.
        alerta={
          reserva !== null && abaixoDaMeta(reserva.meses, reserva.goal_months)
        }
        contexto={
          reserva === null
            ? 'sem dado ainda'
            : reserva.meses === null
              ? 'sem custo fixo cadastrado — não dá pra calcular'
              : abaixoDaMeta(reserva.meses, reserva.goal_months)
                ? `abaixo da meta de ${reserva.goal_months} meses`
                : `meta de ${reserva.goal_months} meses alcançada`
        }
      />
    </FaixaKpi>
  )
}

/**
 * "+R$ 340,00 (+11%) a mais que ago/26".
 *
 * ⚠️ **Nenhum VERDE pra "gastou menos"** — a mesma recusa já paga em
 * `BlocoCategorias`: gastou mais em `--destructive`, gastou menos no cinza
 * neutro, e o sinal de verdade são o `+`/`−` e as palavras.
 */
function Variacao({ numeros }: { numeros: InsightNumbersView }) {
  if (numeros.variation_pf_cents === 0) return 'igual ao mês anterior'

  const gastouMais = numeros.variation_pf_cents > 0
  const sinal = gastouMais ? '+' : '−'
  const pct =
    numeros.variation_pf_pct === null
      ? ''
      : ` (${sinal}${Math.abs(numeros.variation_pf_pct)}%)`

  return (
    <span
      data-testid="kpi-gasto-variacao"
      className={gastouMais ? 'text-destructive font-medium' : undefined}
    >
      {sinal}
      {formatBRL(Math.abs(numeros.variation_pf_cents))}
      {pct} {gastouMais ? 'a mais' : 'a menos'} que{' '}
      {rotuloCompetencia(numeros.previous_competence)}
    </span>
  )
}

/**
 * ⚠️ **O valor do card é o gasto PESSOAL (`is_business = 0`), não a soma com
 * a PJ** — e a variação ao lado é a de PF pelo mesmo motivo: um valor de PF
 * com variação calculada sobre PJ+PF seria duas respostas para perguntas
 * diferentes coladas no mesmo card. A PJ aparece declarada, nunca somada por
 * baixo. Ver "PJ/PF: a conta é o default, a linha é a verdade" no CLAUDE.md.
 */
function GastoContexto({ numeros }: { numeros: InsightNumbersView | null }) {
  if (numeros === null) return 'sem dado ainda'
  return (
    <>
      <Variacao numeros={numeros} />
      {numeros.total_pj_cents !== 0 && (
        <span data-testid="kpi-gasto-pj" className="block">
          + {formatBRL(Math.abs(numeros.total_pj_cents))} na PJ
        </span>
      )}
    </>
  )
}
