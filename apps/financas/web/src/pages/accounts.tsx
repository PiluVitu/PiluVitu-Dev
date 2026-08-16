import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@piluvitu/ui/dialog'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'

export type AccountView = {
  id: string
  name: string
  scope: 'PJ' | 'PF'
  kind: string
  closing_day: number | null
  due_day: number | null
  balance_cents: number
}

const SCOPES = ['PF', 'PJ'] as const

const KINDS = [
  'checking',
  'savings',
  'credit_card',
  'cash',
  'investment',
  'benefit',
] as const

const KIND_LABELS: Record<(typeof KINDS)[number], string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  cash: 'Dinheiro',
  investment: 'Investimento',
  benefit: 'Benefício',
}

/**
 * Confirmação via `Dialog` do design system, nunca `window.confirm()` —
 * mesma decisão (e mesmo motivo: o modo de falha real do Chrome Android, que
 * passa a devolver `false` em silêncio depois de "impedir caixas de diálogo
 * adicionais") já tomada em `debt-detail.tsx` e `recorrentes.tsx`.
 */
type ConfirmacaoPendente = {
  titulo: string
  mensagem: string
  onConfirm: () => void | Promise<void>
}

function dd(n: number): string {
  return String(n).padStart(2, '0')
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [scope, setScope] = useState<'PF' | 'PJ'>('PF')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('checking')
  const [closingDay, setClosingDay] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Arquivamento: `processando` guarda o id da conta em voo, pra desabilitar
  // só o botão daquela linha (mesmo padrão de debt-detail.tsx/recorrentes.tsx).
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(
    null,
  )

  // `vivo` no mesmo formato das outras telas (debt-detail.tsx, DividasPage.tsx):
  // sem a guarda, uma resposta atrasada podia sobrescrever a tela depois que
  // o componente desmontou.
  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    const data = await api<AccountView[]>('/api/accounts')
    if (!vivo()) return
    setAccounts(data)
  }, [])

  useEffect(() => {
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setError(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (nome.trim() === '') {
      setFormError('Dê um nome para a conta.')
      return
    }
    // Espelho, no cliente, do CHECK do schema (kind <> 'credit_card' OR
    // (closing_day IS NOT NULL AND due_day IS NOT NULL)) — sem isto o erro
    // só apareceria depois do POST, como constraint_violation cru do D1.
    if (
      kind === 'credit_card' &&
      (closingDay.trim() === '' || dueDay.trim() === '')
    ) {
      setFormError(
        'Cartão de crédito exige dia de fechamento e de vencimento (1 a 31).',
      )
      return
    }

    // Saldo inicial é OPCIONAL: em branco, a chave nem viaja no corpo —
    // `JSON.stringify` omite `undefined`, e o domínio já aplica `?? 0`
    // (src/domain/accounts.ts). Mandar 0 explícito seria indistinguível de
    // "o dono digitou zero de propósito" e ainda faria toda conta comum
    // carregar uma chave a mais só pra repetir o default.
    let openingBalanceCents: number | undefined
    if (saldoInicial.trim() !== '') {
      try {
        openingBalanceCents = parseBRL(saldoInicial)
      } catch {
        setFormError('Saldo inicial inválido. Use o formato 8.000,50.')
        return
      }
    }

    setSalvando(true)
    // Criar e recarregar são sucessos INDEPENDENTES (ver
    // lib/mutar-e-recarregar.ts): com os dois no mesmo `try`, um POST 201
    // seguido de um GET que falha mostrava o erro do GET como se a conta
    // não tivesse sido criada — e o dono submetia de novo, criando uma
    // conta duplicada. Defeito pré-existente, mesma forma do arquivar.
    const resultado = await mutarERecarregar(
      async () => {
        await api('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({
            name: nome,
            scope,
            kind,
            closing_day:
              kind === 'credit_card' ? Number(closingDay) : undefined,
            due_day: kind === 'credit_card' ? Number(dueDay) : undefined,
            opening_balance_cents: openingBalanceCents,
          }),
        })
        setNome('')
        setClosingDay('')
        setDueDay('')
        setSaldoInicial('')
      },
      carregar,
      'A conta foi criada, mas não consegui recarregar a lista — atualize a página pra vê-la. Não envie de novo: criaria uma conta duplicada.',
    )
    if (!resultado.ok) setFormError(resultado.mensagem)
    setSalvando(false)
  }

  function arquivar(a: AccountView) {
    setConfirmacao({
      titulo: 'Arquivar conta',
      // O texto diz o que a rota FAZ (soft delete: grava `archived_at`, e
      // `GET /api/accounts` passa a esconder a conta) e o que ela NÃO faz
      // (não apaga lançamento nenhum — `transactions.account_id` é
      // ON DELETE RESTRICT). Também diz que não há volta pela tela: não
      // existe rota de desarquivar nem PUT /accounts/:id.
      mensagem: `Arquivar "${a.name}"? Ela some da lista de contas e dos seletores de Lançar e Dívidas. Os lançamentos já feitos continuam no histórico — nada é apagado. Não dá para desarquivar por aqui.`,
      onConfirm: async () => {
        setAcaoErro(null)
        setProcessando(a.id)
        // Arquivar e recarregar em dois `try` separados (padrão de
        // lib/mutar-e-recarregar.ts): um POST 200 seguido de um GET que
        // falha NÃO pode ler como "o arquivamento falhou" — o dono
        // tentaria de novo e bateria em 404 "já arquivada", sem saída.
        const resultado = await mutarERecarregar(
          () => api(`/api/accounts/${a.id}/archive`, { method: 'POST' }),
          carregar,
          `A conta "${a.name}" foi arquivada, mas não consegui recarregar a lista — atualize a página pra vê-la fora dela.`,
        )
        if (!resultado.ok) setAcaoErro(resultado.mensagem)
        setProcessando(null)
      },
    })
  }

  if (error) return <p role="alert">{error}</p>
  if (!accounts) return <p>Carregando…</p>

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>

      {acaoErro ? (
        <p role="alert" className="text-destructive text-sm">
          {acaoErro}
        </p>
      ) : null}

      <div className="space-y-4">
        {SCOPES.map((scope) => {
          const list = accounts.filter((a) => a.scope === scope)
          if (list.length === 0) return null
          return (
            <Card key={scope} data-testid={`grupo-${scope}`}>
              <CardHeader>
                <CardTitle className="text-base">{scope}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {list.map((a) => (
                        <tr key={a.id}>
                          <td className="border-b py-1.5 pr-2 text-left">
                            {a.name}
                            {a.kind === 'credit_card' &&
                            a.closing_day !== null &&
                            a.due_day !== null ? (
                              <small
                                data-testid={`fatura-${a.id}`}
                                className="text-muted-foreground block text-xs"
                              >
                                {` fecha ${dd(a.closing_day)} · vence ${dd(a.due_day)}`}
                              </small>
                            ) : null}
                            {/* Link dentro da célula do nome (a mais larga e
                                flexível), não uma coluna "Ações" nova — a ~390px
                                uma 3ª coluna sai cortada, achado já medido em
                                debt-detail.tsx. */}
                            <div>
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="text-destructive h-auto p-0 text-xs no-underline"
                                aria-label={`Arquivar conta ${a.name}`}
                                data-testid={`arquivar-${a.id}`}
                                disabled={processando === a.id}
                                onClick={() => arquivar(a)}
                              >
                                arquivar
                              </Button>
                            </div>
                          </td>
                          <td
                            data-testid={`saldo-${a.id}`}
                            className="border-b py-1.5 text-right font-medium tabular-nums"
                          >
                            {formatBRL(a.balance_cents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova conta</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-nova-conta"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="conta-nome">Nome</Label>
              <Input
                id="conta-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="conta-escopo">Escopo</Label>
                <Ajuda rotulo="PJ / PF">
                  scope é o padrão da conta; is_business é a verdade do
                  lançamento — dá para pagar algo PF pelo cartão PJ.
                </Ajuda>
              </div>
              <select
                id="conta-escopo"
                className={SELECT_CLASSNAME}
                value={scope}
                onChange={(e) => setScope(e.target.value as 'PF' | 'PJ')}
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="conta-tipo">Tipo</Label>
              <select
                id="conta-tipo"
                className={SELECT_CLASSNAME}
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as (typeof KINDS)[number])
                }
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="conta-saldo-inicial">Saldo inicial</Label>
                <Ajuda rotulo="Saldo inicial">
                  O que a conta já tem hoje, antes de qualquer lançamento aqui —
                  em reais (8.000,50). Em branco vale zero. É este número que a
                  Reserva divide pelo custo fixo pra dizer quantos meses você
                  sobrevive; deixar zerado faz ela mostrar 0,0 meses sem motivo.
                  Não existe edição de conta ainda: se errar, arquive e crie de
                  novo.
                </Ajuda>
              </div>
              <Input
                id="conta-saldo-inicial"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                placeholder="8.000,50"
              />
            </div>

            {kind === 'credit_card' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="conta-fechamento">Dia de fechamento</Label>
                  <Input
                    id="conta-fechamento"
                    type="number"
                    min={1}
                    max={31}
                    value={closingDay}
                    onChange={(e) => setClosingDay(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="conta-vencimento">Dia de vencimento</Label>
                  <Input
                    id="conta-vencimento"
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Criar conta'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={confirmacao !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmacao(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmacao?.titulo}</DialogTitle>
            <DialogDescription>{confirmacao?.mensagem}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const pedido = confirmacao
                setConfirmacao(null)
                void pedido?.onConfirm()
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
