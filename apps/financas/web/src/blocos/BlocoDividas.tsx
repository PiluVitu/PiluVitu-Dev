import { useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import { Bloco } from './Bloco'

export type DebtProgressView = {
  id: string
  title: string
  payee_name: string
  total_cents: number
  paid_cents: number
  remaining_cents: number
}

/**
 * Barra de progresso por dívida ABERTA que EU devo. Só `status=open` +
 * `direction=i_owe` — o que me devem não é compromisso meu, incluir
 * infla a tela na direção errada (ver CLAUDE.md § Dívidas). Autônomo,
 * mesmo padrão de BlocoComprometido/BlocoSaldos: busca sozinho no mount.
 */
export function BlocoDividas() {
  const [dividas, setDividas] = useState<DebtProgressView[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<DebtProgressView[]>('/api/debts?status=open&direction=i_owe')
      .then((data) => {
        if (vivo) setDividas(data)
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  const carregando = dividas === null && erro === null
  const vazio = dividas !== null && dividas.length === 0

  return (
    <Bloco
      titulo="Dívidas"
      carregando={carregando}
      erro={erro}
      vazio={vazio}
      vazioMensagem="Nenhuma dívida em aberto."
    >
      {dividas ? (
        <ul className="space-y-3">
          {dividas.map((d) => {
            // Dívida sem item ainda: total_cents = 0. Dividir por zero daria
            // NaN — em vez de uma barra quebrada, mostra um aviso.
            const temItens = d.total_cents > 0
            const pct = temItens
              ? Math.round((d.paid_cents / d.total_cents) * 100)
              : 0
            return (
              <li key={d.id} data-testid={`divida-${d.id}`}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>
                    {d.title} · {d.payee_name}
                  </span>
                  <span
                    data-testid={`divida-${d.id}-falta`}
                    className="font-semibold tabular-nums"
                  >
                    {formatBRL(d.remaining_cents)}
                  </span>
                </div>
                {temItens ? (
                  <div
                    role="progressbar"
                    aria-label={d.title}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="bg-secondary mt-1 h-2 w-full overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Sem itens lançados ainda.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Bloco>
  )
}
