import { useEffect, useState } from 'react'
import { formatBRL, sumCents } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import { Bloco } from './Bloco'

export type AccountBalanceView = {
  id: string
  name: string
  scope: 'PJ' | 'PF'
  balance_cents: number
}

const SCOPES = ['PJ', 'PF'] as const

/**
 * Saldo por conta, com PJ e PF SEPARADOS — a separação é o motivo de
 * `is_business`/`scope` existir; misturar os dois faz a tela mentir sobre
 * qual dinheiro é realmente do dono (renda fixa PJ vs. o resto). Autônomo,
 * mesmo padrão de BlocoComprometido: busca `GET /api/accounts` sozinho no
 * mount — a rota já esconde conta arquivada por padrão (`?archived=1` só
 * entraria se quiséssemos VER arquivada, o que este bloco não quer).
 */
export function BlocoSaldos() {
  const [accounts, setAccounts] = useState<AccountBalanceView[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<AccountBalanceView[]>('/api/accounts')
      .then((data) => {
        if (vivo) setAccounts(data)
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  const carregando = accounts === null && erro === null
  const semContas = accounts !== null && accounts.length === 0

  // O estado "sem conta" NÃO usa o `vazio`/`vazioMensagem` de `Bloco` (que só
  // renderiza texto) de propósito: produção hoje tem ZERO contas, e sem
  // conta nenhuma o dono não consegue lançar NADA — nem gasto, nem
  // pagamento de dívida. Isto não é decoração, precisa de um link real pra
  // sair do buraco, então é tratado como conteúdo normal (children), não
  // como o "vazio" genérico do card.
  return (
    <Bloco titulo="Saldos" carregando={carregando} erro={erro}>
      {semContas ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Nenhuma conta cadastrada ainda — sem conta, não dá para lançar nada.
          </p>
          <a
            href="#/contas"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium shadow-sm transition-colors"
          >
            Criar conta
          </a>
        </div>
      ) : accounts ? (
        <div className="space-y-4">
          {SCOPES.map((scope) => {
            const list = accounts.filter((a) => a.scope === scope)
            if (list.length === 0) return null
            const total = sumCents(list.map((a) => a.balance_cents))
            return (
              <div key={scope}>
                <div className="flex items-baseline justify-between">
                  <h4 className="text-sm font-semibold">{scope}</h4>
                  <span
                    data-testid={`total-${scope}`}
                    className="text-sm font-semibold"
                  >
                    {formatBRL(total)}
                  </span>
                </div>
                <ul className="mt-1 space-y-1">
                  {list.map((a) => (
                    <li
                      key={a.id}
                      className="text-muted-foreground flex justify-between text-sm"
                    >
                      <span>{a.name}</span>
                      <span data-testid={`saldo-${a.id}`}>
                        {formatBRL(a.balance_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : null}
    </Bloco>
  )
}
