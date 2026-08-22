import { useCallback, useEffect, useState } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import {
  simulateCashPurchase,
  simulateFinancedPurchase,
  type CashPurchaseSimulation,
  type FinancedPurchaseSimulation,
  type FixedCostRange,
} from '@piluvitu/tools/simulacao'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { NumeroCard } from '../blocos/NumeroCard'
import { formatRange } from '../lib/commitments'
import { ROTULO_SECAO } from '../lib/tipografia'
import { CHECKBOX_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import { ALVO_LINHA } from '../lib/touch'
import {
  abaixoDaMeta,
  formatMeses,
  type EmergencyStatusView,
} from '../lib/reserve'
import type { AccountView } from './accounts'

/** Espelha `GET /api/settings` (`domain/settings.ts`, Worker) — mesmo tipo
 * local que `pages/config.tsx` já declara; só o campo que este simulador
 * usa como denominador do % financiado. */
type SettingsView = { fixed_net_cents: number }

/**
 * Resultado de uma tentativa de simular, guardando o erro de validação
 * (valor digitado errado) separado de "nada digitado ainda" (`null`) —
 * o campo vazio não é erro, só ausência de entrada.
 */
type Tentativa<T> = { ok: true; resultado: T } | { ok: false; erro: string }

function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * `null` = nada digitado ainda (não é erro, é ausência de entrada — o
 * campo vazio não deve mostrar `role="alert"`). Não é hook (nenhum
 * `useMemo`): a conta é aritmética barata, recomputar a cada tecla não
 * pesa, e chamar isto DEPOIS do `if (!status...) return` mais abaixo no
 * componente violaria a regra de hooks se fosse um — função simples não
 * tem essa restrição.
 */
function simularAVista(
  valor: string,
  saldoCents: number,
  fixedCost: FixedCostRange,
): Tentativa<CashPurchaseSimulation | null> | null {
  if (valor.trim() === '') return null
  try {
    const amountCents = parseBRL(valor)
    return {
      ok: true,
      resultado: simulateCashPurchase(amountCents, saldoCents, fixedCost),
    }
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e) }
  }
}

function simularFinanciado(
  valor: string,
  parcelas: string,
  fixedNetCents: number,
): Tentativa<FinancedPurchaseSimulation> | null {
  if (valor.trim() === '' || parcelas.trim() === '') return null
  try {
    const totalCents = parseBRL(valor)
    const monthsCount = Number(parcelas)
    if (!Number.isInteger(monthsCount)) {
      throw new RangeError(
        `número de parcelas precisa ser um número inteiro: ${parcelas}`,
      )
    }
    return {
      ok: true,
      resultado: simulateFinancedPurchase(
        totalCents,
        monthsCount,
        fixedNetCents,
      ),
    }
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e) }
  }
}

/**
 * Fatia ⑦ (Task 3, docs/superpowers/specs/2026-07-27-financas-reserva-design.md):
 * o item mais antigo do pedido do dono — "fundo de emergência como
 * prioridade matemática absoluta, antes de ativos que depreciam" — que
 * nunca tinha saído do papel. `GET /api/reserve` já traz `meses` como
 * FAIXA (Task 2) — este componente só apresenta o que a rota calcula,
 * nunca recalcula nada em cliente.
 *
 * ⚠️ Produção tem quase nenhum dado hoje: sem recorrente cadastrada,
 * `meses` chega `null`; sem conta designada, `contas` chega `[]`. Os dois
 * são o estado NORMAL desta tela em produção agora, não um caso de borda —
 * cada um precisa dizer o que fazer, nunca só "sem dados".
 */
export function ReservaPage() {
  const [status, setStatus] = useState<EmergencyStatusView | null>(null)
  const [contas, setContas] = useState<AccountView[] | null>(null)
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Simulador (Task 4, §6 do spec): à vista e financiado, lado a lado.
  const [valorAVista, setValorAVista] = useState('')
  const [valorFinanciado, setValorFinanciado] = useState('')
  const [parcelasFinanciado, setParcelasFinanciado] = useState('')

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    const [statusData, contasData, settingsData] = await Promise.all([
      api<EmergencyStatusView>('/api/reserve'),
      api<AccountView[]>('/api/accounts'),
      // Denominador do % financiado — a MESMA renda fixa configurável que
      // Comprometido/Configurações usam (`GET /api/settings`), nunca um
      // literal fixo aqui: senão trocar a renda em Configurações deixaria
      // este simulador mentindo em silêncio.
      api<SettingsView>('/api/settings'),
    ])
    if (!vivo()) return
    setStatus(statusData)
    setContas(contasData)
    setSettings(settingsData)
    setSelecionadas(new Set(statusData.contas))
  }, [])

  useEffect(() => {
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  function alternar(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function salvarContas() {
    setSaveError(null)
    setSalvando(true)
    // Salvar e recarregar são sucessos INDEPENDENTES (ver
    // lib/mutar-e-recarregar.ts): com os dois no mesmo `try`, um PUT 200
    // seguido de um GET que cai mostrava o erro do GET como se a
    // designação não tivesse sido salva — e a tela continuava exibindo o
    // saldo/os meses ANTIGOS, confirmando visualmente a mentira. O PUT é
    // idempotente (substitui a lista inteira), então reenviar não corrompe
    // nada; o defeito aqui é só enganar o dono sobre o que está salvo.
    const resultado = await mutarERecarregar(
      () =>
        api('/api/reserve/accounts', {
          method: 'PUT',
          body: JSON.stringify({ account_ids: Array.from(selecionadas) }),
        }),
      carregar,
      'As contas da reserva foram salvas, mas não consegui recarregar os números — atualize a página pra ver o saldo e os meses de sobrevivência corretos.',
    )
    if (!resultado.ok) setSaveError(resultado.mensagem)
    setSalvando(false)
  }

  if (loadError) return <p role="alert">{loadError}</p>
  if (!status || !contas || !settings) return <p>Carregando…</p>

  // ⚠️ O alerta olha o PISO (`meses.min`), NUNCA o teto — inversão central
  // desta fatia. No Comprometido o TETO é o perigo (gasto máximo); aqui o
  // PISO é o perigo (sobrevivência mínima). Ver `lib/reserve.ts#abaixoDaMeta`.
  const alerta = abaixoDaMeta(status.meses, status.goal_months)

  // Custo fixo mensal, recuperado de `meta_cents / goal_months` — a mesma
  // faixa que `emergencyStatus` (Worker) já calculou, sem duplicar a soma
  // de recorrentes aqui. `status.meses === null` ⟺ `fixedCost.max === 0`
  // (o mesmo `custo.max === 0` que faz `meses` ser `null` no domínio — ver
  // apps/financas/CLAUDE.md § "Reserva de emergência"), então
  // `simulateCashPurchase` já devolve `null` sozinho nesse caso, sem
  // precisar de um segundo `if` aqui.
  const fixedCost: FixedCostRange = {
    min: status.meta_cents.min / status.goal_months,
    max: status.meta_cents.max / status.goal_months,
  }

  const simulacaoAVista = simularAVista(
    valorAVista,
    status.saldo_cents,
    fixedCost,
  )
  const simulacaoFinanciada = simularFinanciado(
    valorFinanciado,
    parcelasFinanciado,
    settings.fixed_net_cents,
  )

  // ⚠️ O piso continua sendo o perigo aqui também (mesma inversão do card
  // "Situação atual" acima) — gastar reserva à vista FAZ O PISO CAIR, e é
  // esse número que o confronto precisa foregrounded, não só mais um dado
  // neutro na faixa. Reusa o MESMO `abaixoDaMeta` (nunca `.max`) contra a
  // sobrevivência resultante da compra, em vez de duplicar a comparação.
  const resultariaAbaixoDaMeta =
    simulacaoAVista?.ok === true && simulacaoAVista.resultado !== null
      ? abaixoDaMeta(
          simulacaoAVista.resultado.survivalAfter,
          status.goal_months,
        )
      : false

  return (
    <section className="space-y-6" data-testid="pagina-reserva">
      {/* O `<h1>` saiu daqui pra top bar (`App.tsx`); a Ajuda ficou. */}
      <div className="flex items-center gap-3">
        <p className="text-muted-foreground text-sm">
          Quantos meses de custo fixo a reserva cobre hoje.
        </p>
        <Ajuda rotulo="Reserva de emergência">
          Prioridade matemática absoluta, antes de qualquer ativo que deprecia
          (carro, moto, eletrônico) — é o que separa um mês ruim de um problema,
          ainda mais com renda parcialmente volátil (freela).
        </Ajuda>
      </div>

      {/*
        ⚠️ O saldo era um `<strong>` de 14px no meio de uma frase ("Tenho X
        guardados…") — o número que a tela inteira existe pra qualificar
        tinha o mesmo peso das palavras em volta. Virou `NumeroCard` na
        escala HERÓI (30px COM centavos, card de largura total).

        ⚠️ O que vai no `contexto` é meta + meses de sobrevivência — que é
        exatamente pra isso que o `contexto` existe ("um número absoluto sem
        referência não responde nada"). Os meses NÃO poderiam ser o valor do
        card: `NumeroCard` recebe `valorCents` INTEIRO, e `meses` é uma FAIXA
        em meses, não dinheiro.

        ⚠️ O `data-testid` do card é `saldo` de propósito: o valor renderiza
        dentro dele (`saldo-valor`), então quem media o saldo continua
        medindo o saldo.

        ⚠️ O alerta ficou FORA do card, e não dentro do `contexto`: aquele é
        um `<p>`, e um `<p role="alert">` aninhado noutro `<p>` é HTML
        inválido — o navegador fecha o parágrafo sozinho e o layout quebra
        (lição já paga em `recorrentes.tsx`).
      */}
      <div className="space-y-3">
        <NumeroCard
          rotulo="Reserva"
          valorCents={status.saldo_cents}
          escala="heroi"
          data-testid="saldo"
          contexto={
            <>
              <span className="block">
                Guardado nas contas designadas. Meta ({status.goal_months} meses
                de custo fixo, calculada — não digitada):{' '}
                <strong
                  data-testid="meta"
                  className="text-foreground tabular-nums"
                >
                  {formatRange(status.meta_cents)}
                </strong>
              </span>

              {status.meses === null ? (
                <span data-testid="sem-custo-fixo" className="mt-2 block">
                  Ainda não dá para calcular quantos meses a reserva sustenta —
                  nenhuma despesa recorrente em vigor está cadastrada.{' '}
                  <a
                    href="#/recorrentes"
                    className="text-primary underline underline-offset-4"
                  >
                    Cadastre as recorrentes
                  </a>{' '}
                  (Starlink, DAS, contador, INSS...) para saber o custo fixo
                  mensal.
                </span>
              ) : (
                <span className="mt-2 block">
                  Sobrevivo{' '}
                  <strong
                    data-testid="meses"
                    className={cn(
                      'text-foreground',
                      alerta && 'text-destructive font-bold',
                    )}
                  >
                    {formatMeses(status.meses)}
                  </strong>{' '}
                  com o que tenho hoje — o piso é o que a reserva garante num
                  mês ruim, o teto é o cenário bom.
                </span>
              )}
            </>
          }
        />

        {alerta ? (
          <p
            role="alert"
            data-testid="alerta-piso"
            className="text-destructive text-sm font-medium"
          >
            No pior cenário (custo fixo no teto), a reserva fica abaixo da meta
            de {status.goal_months} meses de sobrevivência.
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas designadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {contas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma conta cadastrada ainda.{' '}
              <a
                href="#/contas"
                className="text-primary underline underline-offset-4"
              >
                Criar conta
              </a>
            </p>
          ) : (
            <>
              {status.contas.length === 0 ? (
                <p
                  data-testid="sem-conta-designada"
                  className="text-muted-foreground text-sm"
                >
                  Nenhuma conta foi designada como reserva ainda — o saldo não é
                  um número digitado, é a soma de verdade das contas que você
                  marcar abaixo. Sem designar nenhuma, o saldo fica em R$ 0,00.
                </p>
              ) : null}
              <ul className="space-y-2">
                {contas.map((c) => (
                  <li key={c.id}>
                    {/* ⚠️ MEDIDO em Chrome real a 390×844: o `<input>` tem
                        13,6×16 px — o menor alvo do app inteiro. O alvo de
                        verdade é o `<label>`, que embrulha o input e já
                        alterna a seleção; `ALVO_LINHA` só dá a ele os 44 px
                        de altura, sem mexer no tamanho do quadradinho nem da
                        fonte. */}
                    <label className={cn(ALVO_LINHA, 'gap-3 text-sm')}>
                      <input
                        type="checkbox"
                        className={CHECKBOX_CLASSNAME}
                        checked={selecionadas.has(c.id)}
                        onChange={() => alternar(c.id)}
                      />
                      {c.name} ({formatBRL(c.balance_cents)})
                    </label>
                  </li>
                ))}
              </ul>
              {saveError ? (
                <p role="alert" className="text-destructive text-sm">
                  {saveError}
                </p>
              ) : null}
              <Button type="button" disabled={salvando} onClick={salvarContas}>
                {salvando ? 'Salvando…' : 'Salvar contas designadas'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Simulador: à vista × financiado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            O custo de cada opção em meses de sobrevivência — a unidade que você
            escolheu ao chamar a reserva de prioridade absoluta.
          </p>

          {/* ~390px: lado a lado só a partir de md — empilhado no celular,
              onde o layout mais difícil deste módulo precisa caber. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div data-testid="simulador-a-vista" className="space-y-2">
              <h3 className={ROTULO_SECAO}>À vista</h3>
              <div className="space-y-1.5">
                <Label htmlFor="simulador-a-vista-input">Valor à vista</Label>
                <Input
                  id="simulador-a-vista-input"
                  placeholder="13.000,00"
                  value={valorAVista}
                  onChange={(e) => setValorAVista(e.target.value)}
                />
              </div>

              {simulacaoAVista?.ok === false ? (
                <p role="alert" className="text-destructive text-sm">
                  {simulacaoAVista.erro}
                </p>
              ) : null}

              {simulacaoAVista?.ok === true ? (
                simulacaoAVista.resultado === null ? (
                  <p
                    data-testid="simulador-a-vista-sem-custo-fixo"
                    className="text-muted-foreground text-sm"
                  >
                    Ainda não dá para calcular — falta custo fixo cadastrado
                    (ver "Situação atual" acima).
                  </p>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p>
                      Consome{' '}
                      <strong
                        data-testid="simulador-a-vista-meses-consumidos"
                        className="text-foreground"
                      >
                        {formatMeses(simulacaoAVista.resultado.monthsConsumed)}
                      </strong>{' '}
                      de reserva.
                    </p>
                    <p>
                      Sobrevivência depois:{' '}
                      <strong
                        data-testid="simulador-a-vista-sobrevivencia"
                        className={cn(
                          resultariaAbaixoDaMeta
                            ? 'text-destructive font-bold'
                            : 'text-foreground',
                        )}
                      >
                        {formatMeses(simulacaoAVista.resultado.survivalAfter)}
                      </strong>
                    </p>
                    {resultariaAbaixoDaMeta ? (
                      <p
                        role="alert"
                        data-testid="simulador-a-vista-alerta-piso"
                        className="text-destructive text-sm font-medium"
                      >
                        No pior cenário, esta compra deixa a reserva abaixo da
                        meta de {status.goal_months} meses de sobrevivência.
                      </p>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>

            <div data-testid="simulador-financiado" className="space-y-2">
              <h3 className={ROTULO_SECAO}>Financiado</h3>
              <div className="space-y-1.5">
                <Label htmlFor="simulador-financiado-input">
                  Valor financiado
                </Label>
                <Input
                  id="simulador-financiado-input"
                  placeholder="96.000,00"
                  value={valorFinanciado}
                  onChange={(e) => setValorFinanciado(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="simulador-financiado-parcelas">Parcelas</Label>
                <Input
                  id="simulador-financiado-parcelas"
                  inputMode="numeric"
                  placeholder="72"
                  value={parcelasFinanciado}
                  onChange={(e) => setParcelasFinanciado(e.target.value)}
                />
              </div>

              {simulacaoFinanciada?.ok === false ? (
                <p role="alert" className="text-destructive text-sm">
                  {simulacaoFinanciada.erro}
                </p>
              ) : null}

              {simulacaoFinanciada?.ok === true ? (
                <div className="space-y-1 text-sm">
                  <p>
                    Parcela:{' '}
                    <strong
                      data-testid="simulador-financiado-parcela"
                      className="text-foreground"
                    >
                      {formatBRL(
                        simulacaoFinanciada.resultado.installmentCents,
                      )}
                    </strong>{' '}
                    por mês, por {simulacaoFinanciada.resultado.monthsCount}{' '}
                    meses — é o que entra no Comprometido a partir da primeira
                    parcela.
                  </p>
                  <p>
                    <strong
                      data-testid="simulador-financiado-pct"
                      className="text-foreground"
                    >
                      {simulacaoFinanciada.resultado.pctOfFixedNet}%
                    </strong>{' '}
                    da renda fixa de referência (
                    {formatBRL(settings.fixed_net_cents)}
                    ).
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
