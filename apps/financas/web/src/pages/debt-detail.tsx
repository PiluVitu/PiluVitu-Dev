import { useEffect, useMemo, useState } from 'react'
import { formatBRL, parseBRL, sumCents } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
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
import { todayInTeresina } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import type { AccountView } from './accounts'
import { NovoItemForm } from './NovoItemForm'

export type DebtItemBalanceView = {
  item_id: string
  debt_id: string
  description: string
  amount_cents: number
  allocated_cents: number
  remaining_cents: number
  is_settled: number
}

export type DebtPaymentView = {
  id: string
  debt_id: string
  paid_on: string
  amount_cents: number
  kind: 'cash' | 'offset' | 'forgiven'
  transaction_id: string | null
  notes: string | null
  allocations: Array<{ item_id: string; amount_cents: number }>
}

export type DebtDetailView = {
  debt: {
    id: string
    title: string
    direction: 'i_owe' | 'owed_to_me'
    status: 'open' | 'settled' | 'written_off'
  }
  items: DebtItemBalanceView[]
  payments: DebtPaymentView[]
}

const STATUS_LABEL: Record<DebtDetailView['debt']['status'], string> = {
  open: 'Aberta',
  settled: 'Quitada',
  written_off: 'Baixada',
}

/**
 * Confirmação das quatro ações destrutivas — `Dialog` do design system
 * (`@piluvitu/ui/dialog`), não `window.confirm()` nativo. Trocado em
 * revisão: o `window.confirm()` nativo tem um modo de falha real e sério
 * no Android — depois de disparar repetidas vezes, o Chrome oferece
 * "Impedir que esta página crie caixas de diálogo adicionais"; se o dono
 * marcar isso sem querer, TODO `window.confirm()` seguinte devolve
 * `false` IMEDIATAMENTE, sem erro, sem log, sem qualquer feedback — os
 * quatro botões de excluir/dar baixa ficam inertes até um F5. O fluxo
 * mais provável de disparar isso é exatamente o que esta fatia entrega
 * (limpar vários itens/pagamentos errados em sequência). Um `Dialog`
 * controlado por estado React não pode entrar nesse estado.
 */
type ConfirmacaoPendente = {
  titulo: string
  mensagem: string
  variante?: 'default' | 'destructive'
  onConfirm: () => void | Promise<void>
}

/**
 * Espelho, no cliente, do que os triggers trg_alloc_item_teto e
 * trg_alloc_pagamento_teto barram no D1. Devolve a primeira mensagem de erro,
 * ou null. NAO é a fonte de verdade — só evita ida e volta óbvia.
 */
export function validateAllocations(input: {
  total_cents: number
  items: DebtItemBalanceView[]
  alloc: Record<string, number>
}): string | null {
  const { total_cents, items, alloc } = input

  if (total_cents <= 0) return 'Informe um valor de pagamento maior que zero.'

  for (const item of items) {
    const valor = alloc[item.item_id] ?? 0
    if (valor < 0) return `Alocação negativa em ${item.description}.`
    if (valor > item.remaining_cents) {
      return `${item.description} tem só ${formatBRL(item.remaining_cents)} em aberto — não dá para alocar ${formatBRL(valor)}.`
    }
  }

  const alocado = sumCents(items.map((i) => alloc[i.item_id] ?? 0))
  if (alocado > total_cents) {
    return `A soma das alocações (${formatBRL(alocado)}) passa do valor do pagamento (${formatBRL(total_cents)}).`
  }

  return null
}

function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function DebtDetailPage({ debtId }: { debtId: string }) {
  const [detail, setDetail] = useState<DebtDetailView | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [valor, setValor] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [accountId, setAccountId] = useState('')
  const [allocRaw, setAllocRaw] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Ações destrutivas (Task 5): excluir dívida, dar baixa, excluir item,
  // excluir pagamento — todas pedem confirmação antes de chamar a API (não
  // existe lixeira nem desfazer, ver spec §2/§6). `processando` guarda um
  // id de ação (`'divida'`, `'baixa'`, `item:<id>`, `pagamento:<id>`) pra
  // desabilitar só o botão em voo, sem travar a tela inteira — várias
  // linhas podem, em teoria, ser apagadas em sequência rápida.
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(
    null,
  )

  // `vivo` opcional para o chamador poder barrar o setState se uma resposta
  // obsoleta chegar depois de trocar de divida — mesma guarda de
  // pages/accounts.tsx:16-30. Reusado sem guarda no recarregar pós-envio,
  // onde a chamada é síncrona ao clique do usuário, não a um efeito.
  async function carregar(vivo: () => boolean = () => true) {
    const [d, contas] = await Promise.all([
      api<DebtDetailView>(`/api/debts/${debtId}`),
      api<AccountView[]>('/api/accounts'),
    ])
    if (!vivo()) return
    setDetail(d)
    // payDebt (domain/debts.ts) recusa pagamento em conta credit_card —
    // pagar dívida no cartão é caso real, mas fora desta fatia (a compra
    // entraria na fatura, não sairia do caixa agora). Filtrar aqui evita
    // que o usuário escolha uma opção que o servidor vai sempre rejeitar.
    const semCartao = contas.filter((a) => a.kind !== 'credit_card')
    setAccounts(semCartao)
    setAccountId((atual) => atual || semCartao[0]?.id || '')
  }

  useEffect(() => {
    // Sem isso, uma resposta lenta da divida anterior pode sobrescrever a
    // tela depois que o usuario ja trocou de divida (ou desmontou a pagina)
    // — App.tsx troca só a prop debtId, não desmonta o componente.
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtId])

  const totalCents = useMemo(() => {
    if (valor.trim() === '') return 0
    try {
      return parseBRL(valor)
    } catch {
      return -1
    }
  }, [valor])

  const alloc = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [id, raw] of Object.entries(allocRaw)) {
      if (raw.trim() === '') continue
      try {
        out[id] = parseBRL(raw)
      } catch {
        out[id] = -1
      }
    }
    return out
  }, [allocRaw])

  if (loadError) return <p role="alert">{loadError}</p>
  if (!detail) return <p>Carregando…</p>

  const totalDivida = sumCents(detail.items.map((i) => i.amount_cents))
  const emAberto = sumCents(
    detail.items.map((i) => Math.max(0, i.remaining_cents)),
  )
  const descricaoItem = (id: string) =>
    detail.items.find((i) => i.item_id === id)?.description ?? id

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (totalCents < 0) {
      setFormError('Valor inválido. Use o formato 1.360,00.')
      return
    }

    const erro = validateAllocations({
      total_cents: totalCents,
      items: detail!.items,
      alloc,
    })
    if (erro) {
      setFormError(erro)
      return
    }
    if (!accountId) {
      setFormError('Escolha a conta de onde o dinheiro sai.')
      return
    }

    const allocations = Object.entries(alloc)
      .filter(([, cents]) => cents > 0)
      .map(([item_id, amount_cents]) => ({ item_id, amount_cents }))

    setEnviando(true)
    try {
      await api(`/api/debts/${debtId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          paid_on: paidOn || todayInTeresina(),
          amount_cents: totalCents,
          kind: 'cash',
          account_id: accountId,
          description: `Pgto divida — ${detail!.debt.title}`,
          allocations,
        }),
      })
      setValor('')
      setAllocRaw({})
      await carregar()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'over_allocation') {
        // O trigger do D1 abortou e o batch inteiro reverteu: nem pagamento,
        // nem lançamento no caixa, nem alocação parcial ficaram.
        setFormError(
          `O banco recusou: ${err.message}. Nada foi gravado — recarregue a divida.`,
        )
      } else {
        setFormError(err instanceof ApiError ? err.message : String(err))
      }
    } finally {
      setEnviando(false)
    }
  }

  function pedirConfirmacao(pedido: ConfirmacaoPendente) {
    setConfirmacao(pedido)
  }

  /**
   * Executa uma mutação e SÓ DEPOIS recarrega — em dois `try` separados,
   * não um só (fix de revisão). Antes, `carregar()` morava dentro do MESMO
   * `try` da mutação: se a mutação tivesse sucesso mas o `GET` seguinte
   * falhasse (rede instável logo depois), o `catch` escrevia o erro do GET
   * em `acaoErro` e a tela continuava mostrando o estado ANTIGO — ex.:
   * "Dar baixa" (POST 200) seguido de falha no recarregar deixava o botão
   * "Dar baixa" ainda visível, e tentar de novo batia num 404 "já baixada"
   * — a ação tinha funcionado, a tela dizia que não. Mutação e
   * recarregamento são sucessos/falhas INDEPENDENTES aos olhos do dono.
   */
  async function mutarERecarregar(id: string, mutar: () => Promise<void>) {
    setAcaoErro(null)
    setProcessando(id)
    try {
      await mutar()
    } catch (err: unknown) {
      setAcaoErro(err instanceof ApiError ? err.message : String(err))
      setProcessando(null)
      return
    }
    try {
      await carregar()
    } catch {
      setAcaoErro(
        'A ação foi concluída, mas não consegui recarregar a tela — atualize a página pra ver o resultado.',
      )
    } finally {
      setProcessando(null)
    }
  }

  // Mensagem do SERVIDOR mostrada sem reescrever (crítico pra
  // `debt_has_ledger`: é a mensagem que ensina "Dar baixa" em vez de
  // excluir, ver apps/financas/CLAUDE.md § Dívidas) — nenhuma das quatro
  // ações abaixo tem branch especial pro código de erro, `err.message`
  // vai direto pro `acaoErro`.

  function excluirDivida() {
    pedirConfirmacao({
      titulo: 'Excluir dívida',
      mensagem: `Excluir a dívida "${detail!.debt.title}"? Isso remove a dívida e os itens. Não há como desfazer.`,
      variante: 'destructive',
      onConfirm: async () => {
        setAcaoErro(null)
        setProcessando('divida')
        try {
          await api(`/api/debts/${debtId}`, { method: 'DELETE' })
          window.location.hash = '#/dividas'
        } catch (err: unknown) {
          setAcaoErro(err instanceof ApiError ? err.message : String(err))
        } finally {
          setProcessando(null)
        }
      },
    })
  }

  function darBaixa() {
    pedirConfirmacao({
      titulo: 'Dar baixa',
      mensagem: `Dar baixa em "${detail!.debt.title}"? Ela sai do comprometido; itens, pagamentos e lançamentos continuam no histórico.`,
      onConfirm: () =>
        mutarERecarregar('baixa', async () => {
          await api(`/api/debts/${debtId}/write-off`, { method: 'POST' })
        }),
    })
  }

  function excluirItem(item: DebtItemBalanceView) {
    pedirConfirmacao({
      titulo: 'Excluir item',
      mensagem: `Excluir o item "${item.description}"? Não há como desfazer.`,
      variante: 'destructive',
      onConfirm: () =>
        mutarERecarregar(`item:${item.item_id}`, async () => {
          await api(`/api/debts/${debtId}/items/${item.item_id}`, {
            method: 'DELETE',
          })
        }),
    })
  }

  function excluirPagamento(pagamento: DebtPaymentView) {
    pedirConfirmacao({
      titulo: 'Excluir pagamento',
      mensagem: `Excluir o pagamento de ${formatBRL(pagamento.amount_cents)} em ${dataBR(pagamento.paid_on)}? O lançamento no caixa some junto. Não há como desfazer.`,
      variante: 'destructive',
      onConfirm: () =>
        mutarERecarregar(`pagamento:${pagamento.id}`, async () => {
          await api(`/api/debts/${debtId}/payments/${pagamento.id}`, {
            method: 'DELETE',
          })
        }),
    })
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dívida · {detail.debt.title}
        </h1>
        {detail.items.length === 0 ? (
          <p className="text-muted-foreground mt-1 text-sm">
            Sem itens ainda — nada em aberto pra cobrar.
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">
            {detail.debt.direction === 'i_owe' ? 'devo' : 'me devem'}{' '}
            <strong className="text-foreground">{formatBRL(emAberto)}</strong>{' '}
            de {formatBRL(totalDivida)}
          </p>
        )}
        {detail.debt.status !== 'open' ? (
          <p className="text-muted-foreground mt-1 text-sm">
            Situação: {STATUS_LABEL[detail.debt.status]}
          </p>
        ) : null}

        {acaoErro ? (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {acaoErro}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {detail.debt.status === 'open' ? (
            // Botão + Ajuda num wrapper PRÓPRIO (fix de revisão): soltos
            // no mesmo `gap-2` do "Excluir dívida", o "?" ficava a 8px dos
            // DOIS botões (MEDIDO a 390px), sem pista visual de qual ele
            // explica — um toque em "?" esperando ajuda do botão vermelho
            // podia render o texto de "Dar baixa" (o oposto de excluir)
            // colado mentalmente na ação irreversível. `gap-1` (menor que
            // o `gap-2` entre grupos) marca a dupla como uma unidade.
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={processando === 'baixa'}
                onClick={darBaixa}
              >
                {processando === 'baixa' ? 'Baixando…' : 'Dar baixa'}
              </Button>
              <Ajuda rotulo="Dar baixa">
                Encerra sem apagar: preserva itens, pagamentos e lançamentos, e
                tira do comprometido.
              </Ajuda>
            </div>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={processando === 'divida'}
            onClick={excluirDivida}
          >
            {processando === 'divida' ? 'Excluindo…' : 'Excluir dívida'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Itens
            <Ajuda rotulo="Itens">
              Itens são o que compõe a dívida (estoque). Não geram lançamento no
              caixa — só pagamentos geram.
            </Ajuda>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              O total da dívida sai da soma dos itens. Adicione o primeiro
              abaixo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b py-1.5 pr-2 text-left font-medium">
                      Item
                    </th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">
                      total
                    </th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">
                      pago
                    </th>
                    <th className="border-b py-1.5 pl-2 text-right font-medium">
                      falta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((i) => (
                    <tr
                      key={i.item_id}
                      data-testid={`item-${i.item_id}`}
                      className={cn(i.is_settled && 'quitado opacity-[0.55]')}
                    >
                      <td className="border-b py-1.5 pr-2 text-left">
                        {/* Excluir mora DENTRO da célula do Item, não numa
                            5ª coluna: MEDIDO a 390px (o alvo desta task) —
                            uma coluna "Ações" extra ficava cortada dentro
                            do overflow-x-auto da tabela (chegava a
                            renderizar só a letra "E"). A célula do Item já
                            é a mais larga/flexível (o texto já quebra em
                            várias linhas pra descrições longas), então um
                            link pequeno abaixo do nome cabe sem alargar a
                            tabela. `line-through` fica só no `<span>` do
                            texto, não na célula inteira — senão o link
                            "excluir" também saía riscado. */}
                        <span className={cn(i.is_settled && 'line-through')}>
                          {i.description}
                          {i.is_settled ? (
                            <span aria-label="quitado"> ✓</span>
                          ) : null}
                        </span>
                        <div>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="text-destructive h-auto p-0 text-xs no-underline"
                            aria-label={`Excluir item ${i.description}`}
                            data-testid={`excluir-item-${i.item_id}`}
                            disabled={processando === `item:${i.item_id}`}
                            onClick={() => excluirItem(i)}
                          >
                            excluir
                          </Button>
                        </div>
                      </td>
                      <td
                        data-testid={`item-${i.item_id}-total`}
                        className="border-b px-2 py-1.5 text-right"
                      >
                        {formatBRL(i.amount_cents)}
                      </td>
                      <td
                        data-testid={`item-${i.item_id}-pago`}
                        className="border-b px-2 py-1.5 text-right"
                      >
                        {formatBRL(i.allocated_cents)}
                      </td>
                      <td
                        data-testid={`item-${i.item_id}-falta`}
                        className="border-b py-1.5 pl-2 text-right font-medium"
                      >
                        {formatBRL(Math.max(0, i.remaining_cents))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 border-t pt-6">
            <NovoItemForm debtId={debtId} onCreated={carregar} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.payments.length === 0 ? (
            // Fix de revisão: mesma tela do próprio screenshot do dono —
            // §3.3 do spec cobriu os dois vazios de Itens, mas deixou este
            // card sempre em branco quando não há pagamento nenhum ainda
            // (o caso comum de uma dívida recém-criada). Aponta pro
            // formulário logo abaixo, em vez de só um espaço vazio.
            <p className="text-muted-foreground text-sm">
              Nenhum pagamento ainda — registre o primeiro no formulário abaixo.
            </p>
          ) : (
            <ul className="space-y-3">
              {detail.payments.map((p) => (
                <li
                  key={p.id}
                  data-testid={`pagamento-${p.id}`}
                  className="text-sm"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">
                      {dataBR(p.paid_on)}
                    </span>{' '}
                    <strong data-testid={`pagamento-${p.id}-total`}>
                      {formatBRL(p.amount_cents)}
                    </strong>
                  </div>
                  <ul className="text-muted-foreground mt-1 space-y-0.5 pl-4">
                    {p.allocations.map((a) => (
                      <li
                        key={a.item_id}
                        data-testid={`alloc-${p.id}-${a.item_id}`}
                      >
                        {descricaoItem(a.item_id)} · {formatBRL(a.amount_cents)}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Excluir pagamento de ${formatBRL(p.amount_cents)} em ${dataBR(p.paid_on)}`}
                      data-testid={`excluir-pagamento-${p.id}`}
                      disabled={processando === `pagamento:${p.id}`}
                      onClick={() => excluirPagamento(p)}
                    >
                      {processando === `pagamento:${p.id}` ? '…' : 'Excluir'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-pagamento"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="pagamento-valor">Valor</Label>
              <Input
                id="pagamento-valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="1.360,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pagamento-data">Data</Label>
              <Input
                id="pagamento-data"
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pagamento-conta">Conta</Label>
              <select
                id="pagamento-conta"
                className={SELECT_CLASSNAME}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-2 border-t pt-4">
              <legend className="flex items-center gap-2 text-sm font-medium">
                Dividir entre itens
                <Ajuda rotulo="Dividir entre itens">
                  Um pagamento pode cobrir vários itens. É isso que responde
                  &quot;o Steam Deck já está quitado?&quot;.
                </Ajuda>
              </legend>
              {detail.items.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  A divisão aparece depois que existir pelo menos um item.
                </p>
              ) : (
                detail.items.map((i) => (
                  <div key={i.item_id} className="space-y-1.5">
                    <Label htmlFor={`alocacao-${i.item_id}`}>
                      {i.description}
                    </Label>
                    <Input
                      id={`alocacao-${i.item_id}`}
                      value={allocRaw[i.item_id] ?? ''}
                      disabled={i.is_settled === 1}
                      onChange={(e) =>
                        setAllocRaw((prev) => ({
                          ...prev,
                          [i.item_id]: e.target.value,
                        }))
                      }
                      placeholder={formatBRL(Math.max(0, i.remaining_cents))}
                    />
                  </div>
                ))
              )}
            </fieldset>

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Registrar pagamento'}
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
              variant={confirmacao?.variante ?? 'default'}
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
