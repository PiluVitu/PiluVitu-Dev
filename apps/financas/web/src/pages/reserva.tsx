import { useCallback, useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { formatRange } from '../lib/commitments'
import { CHECKBOX_CLASSNAME } from '../lib/form-classes'
import {
  abaixoDaMeta,
  formatMeses,
  type EmergencyStatusView,
} from '../lib/reserve'
import type { AccountView } from './accounts'

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
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    const [statusData, contasData] = await Promise.all([
      api<EmergencyStatusView>('/api/reserve'),
      api<AccountView[]>('/api/accounts'),
    ])
    if (!vivo()) return
    setStatus(statusData)
    setContas(contasData)
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
    try {
      await api('/api/reserve/accounts', {
        method: 'PUT',
        body: JSON.stringify({ account_ids: Array.from(selecionadas) }),
      })
      await carregar()
    } catch (err: unknown) {
      setSaveError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  if (loadError) return <p role="alert">{loadError}</p>
  if (!status || !contas) return <p>Carregando…</p>

  // ⚠️ O alerta olha o PISO (`meses.min`), NUNCA o teto — inversão central
  // desta fatia. No Comprometido o TETO é o perigo (gasto máximo); aqui o
  // PISO é o perigo (sobrevivência mínima). Ver `lib/reserve.ts#abaixoDaMeta`.
  const alerta = abaixoDaMeta(status.meses, status.goal_months)

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Reserva de emergência
        </h1>
        <Ajuda rotulo="Reserva de emergência">
          Prioridade matemática absoluta, antes de qualquer ativo que deprecia
          (carro, moto, eletrônico) — é o que separa um mês ruim de um problema,
          ainda mais com renda parcialmente volátil (freela).
        </Ajuda>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Situação atual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            Tenho{' '}
            <strong data-testid="saldo" className="text-foreground">
              {formatBRL(status.saldo_cents)}
            </strong>{' '}
            guardados nas contas designadas como reserva.
          </p>
          <p>
            Meta ({status.goal_months} meses de custo fixo, calculada — não
            digitada):{' '}
            <strong data-testid="meta" className="text-foreground">
              {formatRange(status.meta_cents)}
            </strong>
          </p>

          {status.meses === null ? (
            <p
              data-testid="sem-custo-fixo"
              className="text-muted-foreground text-sm"
            >
              Ainda não dá para calcular quantos meses a reserva sustenta —
              nenhuma despesa recorrente em vigor está cadastrada.{' '}
              <a
                href="#/recorrentes"
                className="text-primary underline underline-offset-4"
              >
                Cadastre as recorrentes
              </a>{' '}
              (Starlink, DAS, contador, INSS...) para saber o custo fixo mensal.
            </p>
          ) : (
            <p>
              Sobrevivo{' '}
              <strong
                data-testid="meses"
                className={cn(alerta && 'text-destructive font-bold')}
              >
                {formatMeses(status.meses)}
              </strong>{' '}
              com o que tenho hoje — o piso é o que a reserva garante num mês
              ruim, o teto é o cenário bom.
            </p>
          )}

          {alerta ? (
            <p
              role="alert"
              data-testid="alerta-piso"
              className="text-destructive text-sm font-medium"
            >
              No pior cenário (custo fixo no teto), a reserva fica abaixo da
              meta de {status.goal_months} meses de sobrevivência.
            </p>
          ) : null}
        </CardContent>
      </Card>

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
                    <label className="flex items-center gap-2 text-sm">
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
    </section>
  )
}
