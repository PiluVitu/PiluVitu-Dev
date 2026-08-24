import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Badge } from '@piluvitu/ui/badge'
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
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { formatRange } from '../lib/commitments'
import { todayInTeresina } from '../lib/dates'
import { CHECKBOX_CLASSNAME, SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import { NUMERO_GRID, ROTULO_SECAO } from '../lib/tipografia'
import { ALVO_LINK, ALVO_LINK_FIM } from '../lib/touch'
import type { AccountView } from './accounts'

/**
 * Fatia ⑥ (Task 5, docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md):
 * tela de CRUD pra `recurring_expenses` — Starlink R$ 189, DAS R$ 12–600,
 * contador e INSS, que até aqui não tinham onde ser cadastrados. Espelha o
 * shape de `RecurringExpense` (Worker, `src/domain/recurring.ts`).
 */
export type RecurringExpenseView = {
  id: string
  description: string
  category_id: string | null
  account_id: string | null
  scope: 'PJ' | 'PF'
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on: string | null
  active: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type CategoryOption = { id: string; name: string }

const SCOPES = ['PJ', 'PF'] as const
// Valor de "nenhuma categoria/conta" no <select> — string vazia em vez de
// um sentinel tipo '__nenhuma__' porque o backend já trata '' e undefined
// como "não informado" pro campo virar null (ver enviar() abaixo).
const NENHUMA = ''

/**
 * Confirmação de exclusão via `Dialog` do design system, nunca
 * `window.confirm()` — mesma decisão (e mesmo motivo: o modo de falha real
 * do Chrome Android, ver `debt-detail.tsx`) já tomada na Task 5 da fatia de
 * exclusão/ajuda.
 */
type ConfirmacaoPendente = {
  titulo: string
  mensagem: string
  onConfirm: () => void | Promise<void>
}

function dd(n: number): string {
  return String(n).padStart(2, '0')
}

// Sem prefixo 'R$ ' no campo — mesmo padrão de pages/config.tsx#paraCampo.
function paraCampo(cents: number): string {
  return formatBRL(cents).replace('R$ ', '')
}

/**
 * A faixa min/max em destaque — **a razão de ser desta tela**.
 *
 * ⚠️ **Nunca vira média.** O Simples varia R$ 12–600 conforme o faturamento, e
 * um número só no lugar do intervalo apagaria exatamente a informação que
 * justifica a coluna existir (`amount_min_cents`/`amount_max_cents`, migration
 * `0006`). `formatRange` já resolve o caso fixo (`min === max` ⇒ UM número, sem
 * repetir), e é ele que continua ditando o texto.
 *
 * ⚠️ **Os dois valores são spans `whitespace-nowrap` com o " a " FORA deles —
 * se um dia quebrar, a quebra cai no separador, nunca dentro de um número.**
 *
 * MEDIDO em Chrome real a 390×844, com o pior caso que o dado permite
 * (`R$ 12,00 a R$ 1.234.567,89`): a caixa útil da linha é **306 px**, a faixa
 * a 24px mede **282 px** e cabe em **UMA** caixa de linha — hoje ela NÃO
 * quebra. (Uma estimativa por `canvas.measureText` tinha dito 304,1 px e
 * "quebra"; a medição no render real desmentiu — é a segunda que vale.)
 *
 * Os `nowrap` ficam mesmo assim, como guarda barata pro dia em que a margem
 * de 24 px acabar (um valor maior, uma fonte diferente, um container mais
 * estreito): sem eles, a quebra pode cair DENTRO de um valor e deixar um `R$`
 * órfão numa caixa de linha — exatamente o defeito já pago em
 * `pages/accounts.tsx`, onde `-R$ 2.345,00` partia com o `-R$` sozinho (e ali
 * o sinal é o que distingue "devo" de "tenho").
 *
 * ⚠️ **Centavos ficam** (`formatRange`, não `formatRangeSemCentavos`): esta é a
 * DEFINIÇÃO da recorrente, não uma manchete de grid apertado — Starlink é
 * `R$ 189,00`, e `formatBRLSemCentavos` ARREDONDA (R$ 189,50 viraria "R$ 190").
 * Numa tela de cadastro, arredondar o valor que o dono cadastrou é mentir
 * sobre o que está gravado.
 */
function FaixaValor({ min, max }: { min: number; max: number }) {
  if (min === max) {
    return (
      <span className="whitespace-nowrap">{formatRange({ min, max })}</span>
    )
  }
  return (
    <>
      <span className="whitespace-nowrap">{formatBRL(min)}</span>
      {' a '}
      <span className="whitespace-nowrap">{formatBRL(max)}</span>
    </>
  )
}

const FORM_INICIAL = {
  descricao: '',
  categoryId: NENHUMA,
  accountId: NENHUMA,
  scope: 'PJ' as 'PJ' | 'PF',
  diaDoMes: '1',
  varia: false,
  valorMin: '',
  valorMax: '',
  terminaEm: '',
  notas: '',
  ativa: true,
}

export function RecorrentesPage() {
  const [recorrentes, setRecorrentes] = useState<RecurringExpenseView[] | null>(
    null,
  )
  const [categorias, setCategorias] = useState<CategoryOption[]>([])
  const [contas, setContas] = useState<AccountView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [descricao, setDescricao] = useState(FORM_INICIAL.descricao)
  const [categoryId, setCategoryId] = useState(FORM_INICIAL.categoryId)
  const [accountId, setAccountId] = useState(FORM_INICIAL.accountId)
  const [scope, setScope] = useState<'PJ' | 'PF'>(FORM_INICIAL.scope)
  const [diaDoMes, setDiaDoMes] = useState(FORM_INICIAL.diaDoMes)
  const [varia, setVaria] = useState(FORM_INICIAL.varia)
  const [valorMin, setValorMin] = useState(FORM_INICIAL.valorMin)
  const [valorMax, setValorMax] = useState(FORM_INICIAL.valorMax)
  const [comecaEm, setComecaEm] = useState(() => todayInTeresina())
  const [terminaEm, setTerminaEm] = useState(FORM_INICIAL.terminaEm)
  const [notas, setNotas] = useState(FORM_INICIAL.notas)
  const [ativa, setAtiva] = useState(FORM_INICIAL.ativa)
  const [formError, setFormError] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Exclusão (mesmo padrão de debt-detail.tsx): `processando` guarda o id
  // da linha em voo, pra desabilitar só o botão daquela linha.
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(
    null,
  )

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    // GET /api/recurring devolve TODAS as recorrentes, ativas E pausadas
    // (includeInactive: true, decisão do Task 4/routes/recurring.ts) — é
    // essa a rota de CRUD/gestão, ao contrário de projectRecurring/
    // commitments(), que só usam as ativas.
    const [rec, cat, cts] = await Promise.all([
      api<RecurringExpenseView[]>('/api/recurring'),
      api<CategoryOption[]>('/api/categories?kind=expense'),
      api<AccountView[]>('/api/accounts'),
    ])
    if (!vivo()) return
    setRecorrentes(rec)
    setCategorias(cat)
    setContas(cts)
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

  function limparFormulario() {
    setEditandoId(null)
    setDescricao(FORM_INICIAL.descricao)
    setCategoryId(FORM_INICIAL.categoryId)
    setAccountId(FORM_INICIAL.accountId)
    setScope(FORM_INICIAL.scope)
    setDiaDoMes(FORM_INICIAL.diaDoMes)
    setVaria(FORM_INICIAL.varia)
    setValorMin(FORM_INICIAL.valorMin)
    setValorMax(FORM_INICIAL.valorMax)
    setComecaEm(todayInTeresina())
    setTerminaEm(FORM_INICIAL.terminaEm)
    setNotas(FORM_INICIAL.notas)
    setAtiva(FORM_INICIAL.ativa)
    setFormError(null)
  }

  function editar(r: RecurringExpenseView) {
    const temFaixa = r.amount_min_cents !== r.amount_max_cents
    setEditandoId(r.id)
    setDescricao(r.description)
    setCategoryId(r.category_id ?? NENHUMA)
    setAccountId(r.account_id ?? NENHUMA)
    setScope(r.scope)
    setDiaDoMes(String(r.day_of_month))
    setVaria(temFaixa)
    setValorMin(paraCampo(r.amount_min_cents))
    setValorMax(temFaixa ? paraCampo(r.amount_max_cents) : '')
    setComecaEm(r.starts_on)
    setTerminaEm(r.ends_on ?? '')
    setNotas(r.notes ?? '')
    setAtiva(r.active === 1)
    setFormError(null)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (descricao.trim() === '') {
      setFormError('Dê uma descrição para a recorrente.')
      return
    }
    const dia = Number(diaDoMes)
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      setFormError('Dia do mês precisa ser um número inteiro entre 1 e 31.')
      return
    }
    if (comecaEm.trim() === '') {
      setFormError('Informe a partir de quando a recorrente vale.')
      return
    }

    let minCents: number
    try {
      minCents = parseBRL(valorMin)
    } catch {
      setFormError('Valor inválido. Use o formato 189,00.')
      return
    }
    if (minCents <= 0) {
      setFormError('Valor inválido. Use o formato 189,00.')
      return
    }

    let maxCents = minCents
    if (varia) {
      try {
        maxCents = parseBRL(valorMax)
      } catch {
        setFormError('Valor máximo inválido. Use o formato 600,00.')
        return
      }
      if (maxCents < minCents) {
        setFormError(
          'O valor máximo não pode ser menor que o mínimo — troque os dois ou desmarque "varia?".',
        )
        return
      }
    }

    setSalvando(true)
    // Salvar e recarregar são sucessos INDEPENDENTES (ver
    // lib/mutar-e-recarregar.ts): com os dois no mesmo `try`, um 201/200
    // seguido de um GET que cai mostrava o erro do GET como se a recorrente
    // não tivesse sido salva. No caso da CRIAÇÃO isso custa caro — o dono
    // reenviava e criava uma recorrente duplicada, que o Comprometido passa
    // a somar duas vezes: exatamente a dupla contagem que este módulo
    // existe pra matar.
    const editando = editandoId !== null
    const resultado = await mutarERecarregar(
      async () => {
        const payload = {
          description: descricao,
          category_id: categoryId || null,
          account_id: accountId || null,
          scope,
          day_of_month: dia,
          amount_min_cents: minCents,
          amount_max_cents: maxCents,
          starts_on: comecaEm,
          ends_on: terminaEm || null,
          active: ativa ? 1 : 0,
          notes: notas || null,
        }
        if (editandoId) {
          await api(`/api/recurring/${editandoId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        } else {
          await api('/api/recurring', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        }
        // Limpar só depois do 201/200, ainda dentro da mutação — mesma
        // decisão de accounts.tsx/DividasPage.tsx: com a recorrente já
        // salva, um formulário ainda preenchido convida ao reenvio, e
        // reenviar uma CRIAÇÃO duplica. A descrição vai nomeada na
        // mensagem de recarga, então nada some em silêncio.
        limparFormulario()
      },
      carregar,
      editando
        ? `A recorrente "${descricao}" foi salva, mas não consegui recarregar a lista — atualize a página pra ver a alteração.`
        : `A recorrente "${descricao}" foi criada, mas não consegui recarregar a lista — atualize a página pra vê-la. Não envie de novo: criaria uma recorrente duplicada, e o Comprometido passaria a contar esse valor duas vezes.`,
    )
    if (!resultado.ok) setFormError(resultado.mensagem)
    setSalvando(false)
  }

  function excluir(r: RecurringExpenseView) {
    setConfirmacao({
      titulo: 'Excluir recorrente',
      mensagem: `Excluir "${r.description}"? Isso não apaga nenhum lançamento já feito — só a definição da recorrência. Não há como desfazer.`,
      onConfirm: async () => {
        setAcaoErro(null)
        setProcessando(r.id)
        // Excluir e recarregar em dois `try` separados (padrão de
        // lib/mutar-e-recarregar.ts): um DELETE 200 seguido de um GET que
        // cai NÃO pode ler como "a exclusão falhou" — o dono tentaria de
        // novo e bateria num 404, sem nada explicando por quê.
        const resultado = await mutarERecarregar(
          async () => {
            await api(`/api/recurring/${r.id}`, { method: 'DELETE' })
            if (editandoId === r.id) limparFormulario()
          },
          carregar,
          `A recorrente "${r.description}" foi excluída, mas não consegui recarregar a lista — atualize a página pra confirmar. Nenhum lançamento já feito foi apagado.`,
        )
        if (!resultado.ok) setAcaoErro(resultado.mensagem)
        setProcessando(null)
      },
    })
  }

  if (loadError) return <p role="alert">{loadError}</p>
  if (!recorrentes) return <p>Carregando…</p>

  const nomeCategoria = (id: string | null) =>
    id === null ? null : (categorias.find((c) => c.id === id)?.name ?? null)
  const nomeConta = (id: string | null) =>
    id === null ? null : (contas.find((c) => c.id === id)?.name ?? null)

  /*
    ⚠️ Ativa × pausada é a divisão que MUDA O SIGNIFICADO da linha, não uma
    ordenação cosmética: só `active = 1` entra em `projectRecurring()`/
    `commitments()` (o filtro é `WHERE active = 1`, no SQL do Worker). Numa
    lista plana, uma pausada e uma ativa liam igual — e a pergunta que o dono
    faz aqui ("o que está comprometendo meu mês?") tem respostas opostas nas
    duas.

    A ordem é ativas primeiro: é o grupo que responde essa pergunta. O grupo
    vazio simplesmente não renderiza (nada de "Pausadas · 0").

    ⚠️ O badge "Pausada" de cada linha CONTINUA — o cabeçalho de grupo é
    redundante com ele de propósito. O badge viaja com a linha; se um dia
    alguém filtrar/reordenar, a linha continua se explicando sozinha.
  */
  const ativas = recorrentes.filter((r) => r.active === 1)
  const pausadas = recorrentes.filter((r) => r.active !== 1)
  const grupos = [
    { chave: 'ativas', rotulo: 'Ativas', itens: ativas },
    { chave: 'pausadas', rotulo: 'Pausadas', itens: pausadas },
  ] as const

  return (
    <section className="space-y-6" data-testid="pagina-recorrentes">
      {acaoErro ? (
        <p role="alert" className="text-destructive text-sm">
          {acaoErro}
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {recorrentes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma despesa recorrente cadastrada ainda.
            </p>
          ) : (
            <div className="space-y-6" data-testid="lista-recorrentes">
              {grupos.map((grupo) =>
                grupo.itens.length === 0 ? null : (
                  <div key={grupo.chave} data-testid={`grupo-${grupo.chave}`}>
                    <p className={cn(ROTULO_SECAO, 'mb-2')}>
                      {grupo.rotulo} · {grupo.itens.length}
                    </p>
                    <ul className="space-y-3">
                      {grupo.itens.map((r) => (
                        <li
                          key={r.id}
                          data-testid={`recorrente-${r.id}`}
                          className="rounded-md border p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{r.description}</span>
                            {r.active === 0 ? (
                              <Badge
                                variant="secondary"
                                data-testid={`status-${r.id}`}
                              >
                                Pausada
                              </Badge>
                            ) : null}
                          </div>
                          {/*
                            ⚠️ A faixa saiu da ponta direita da linha e virou
                            LINHA PRÓPRIA, em `NUMERO_GRID` (24px) — antes era
                            `text-sm` (14px) espremida contra a descrição, com
                            `whitespace-nowrap` como única defesa.

                            É a linha própria que paga o aumento de escala:
                            MEDIDO em Chrome real a 390, sozinha ela tem os
                            **306 px** úteis inteiros em vez de dividi-los com
                            a descrição, e a faixa mais longa que o dado
                            permite mede **282 px** — cabe, em uma linha só.
                          */}
                          <p
                            data-testid={`faixa-${r.id}`}
                            className={cn('mt-1', NUMERO_GRID)}
                          >
                            <FaixaValor
                              min={r.amount_min_cents}
                              max={r.amount_max_cents}
                            />
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {r.scope} · dia {dd(r.day_of_month)}
                            {nomeCategoria(r.category_id)
                              ? ` · ${nomeCategoria(r.category_id)}`
                              : ''}
                            {nomeConta(r.account_id)
                              ? ` · ${nomeConta(r.account_id)}`
                              : ''}
                          </p>
                          {/*
                            ⚠️ MEDIDO em Chrome real a 390×844: `Editar` a
                            **34×16 px** e `Excluir` a **38,6×16 px**,
                            separados por **12 px**. Os 16 px de altura ficam
                            abaixo até do mínimo de 24×24 do WCAG 2.5.8 (AA),
                            e o par (destrutivo colado no rotineiro) é o mesmo
                            defeito já medido e corrigido em `extrato` e
                            `categorias` — com ~34 px de contato o polegar
                            cobre os dois, e errar aqui apaga a recorrente que
                            alimenta o Comprometido.

                            `ALVO_LINK`/`ALVO_LINK_FIM` levam os dois aos 44 px
                            SEM mexer na fonte (`text-xs` intacto) nem no x do
                            texto, e o `ml-auto` do destrutivo troca os 12 px
                            por toda a sobra da linha.
                          */}
                          <div className="mt-2 flex items-center gap-3">
                            <Button
                              type="button"
                              variant="link"
                              data-testid={`editar-${r.id}`}
                              className={cn('h-auto p-0 text-xs', ALVO_LINK)}
                              onClick={() => editar(r)}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="link"
                              data-testid={`excluir-${r.id}`}
                              className={cn(
                                'text-destructive h-auto p-0 text-xs',
                                ALVO_LINK_FIM,
                              )}
                              disabled={processando === r.id}
                              onClick={() => excluir(r)}
                            >
                              {processando === r.id ? 'Excluindo…' : 'Excluir'}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editandoId ? 'Editar recorrente' : 'Nova recorrente'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-recorrente"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="recorrente-descricao">Descrição</Label>
              <Input
                id="recorrente-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-categoria">Categoria</Label>
                <select
                  id="recorrente-categoria"
                  className={SELECT_CLASSNAME}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value={NENHUMA}>— nenhuma —</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-conta">Conta</Label>
                <select
                  id="recorrente-conta"
                  className={SELECT_CLASSNAME}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value={NENHUMA}>— nenhuma —</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-escopo">Escopo</Label>
                <select
                  id="recorrente-escopo"
                  className={SELECT_CLASSNAME}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'PJ' | 'PF')}
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-dia">Dia do mês</Label>
                <Input
                  id="recorrente-dia"
                  type="number"
                  min={1}
                  max={31}
                  value={diaDoMes}
                  onChange={(e) => setDiaDoMes(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recorrente-valor">
                {varia ? 'Valor mínimo' : 'Valor'}
              </Label>
              <Input
                id="recorrente-valor"
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                placeholder="189,00"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={CHECKBOX_CLASSNAME}
                    checked={varia}
                    onChange={(e) => setVaria(e.target.checked)}
                  />
                  Varia?
                </label>
                <Ajuda rotulo="Faixa">
                  O Simples varia de R$ 12 a R$ 600 conforme o faturamento —
                  entrar com a média (R$ 306) seria o número que NUNCA acontece.
                  Marque "varia?" e informe o piso (mínimo garantido) e o teto
                  (pior mês); deixe desmarcado pra um valor fixo, como o
                  Starlink.
                </Ajuda>
              </div>

              {varia ? (
                <div className="space-y-1.5 pt-1.5">
                  <Label htmlFor="recorrente-valor-max">Valor máximo</Label>
                  <Input
                    id="recorrente-valor-max"
                    value={valorMax}
                    onChange={(e) => setValorMax(e.target.value)}
                    placeholder="600,00"
                  />
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-inicio">Começa em</Label>
                <Input
                  id="recorrente-inicio"
                  type="date"
                  value={comecaEm}
                  onChange={(e) => setComecaEm(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recorrente-fim">Termina em (opcional)</Label>
                <Input
                  id="recorrente-fim"
                  type="date"
                  value={terminaEm}
                  onChange={(e) => setTerminaEm(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recorrente-notas">Notas (opcional)</Label>
              <Input
                id="recorrente-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={CHECKBOX_CLASSNAME}
                checked={ativa}
                onChange={(e) => setAtiva(e.target.checked)}
              />
              Ativa
            </label>

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando…'
                  : editandoId
                    ? 'Salvar alterações'
                    : 'Criar recorrente'}
              </Button>
              {editandoId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={limparFormulario}
                >
                  Cancelar edição
                </Button>
              ) : null}
            </div>
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
