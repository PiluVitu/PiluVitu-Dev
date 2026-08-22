import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatBRL, parseBRL, sumCents } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { badgeVariants } from '@piluvitu/ui/badge'
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
import { useMenorQueSm } from '../lib/breakpoint'
import { todayInTeresina } from '../lib/dates'
import { CHECKBOX_CLASSNAME, SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import { ALVO_LINHA, ALVO_LINK, ALVO_LINK_FIM } from '../lib/touch'
import type { AccountView } from './accounts'
import type { CategoryOption } from './recorrentes'
import { ROTULO } from '../lib/tipografia'

/**
 * O que `GET /api/transactions` devolve por linha (espelho de
 * `Transaction`, `src/domain/transactions.ts` — a SPA não importa através
 * da fronteira Worker/bundle, mesma razão de `lib/dates.ts` duplicar
 * `todayInTeresina`).
 *
 * ⚠️ `transfer_id`/`parent_id`/`imported_id` vêm em TODA linha e são o
 * único sinal de dono que esta tela consegue ler sozinha — ver
 * `mensagemDeExclusao` mais abaixo pro que dá e o que NÃO dá pra derivar
 * daqui.
 */
export type TransactionView = {
  id: string
  account_id: string
  amount_cents: number
  purchase_date: string
  bill_competence: string | null
  settled_at: string | null
  description: string
  payee_id: string | null
  category_id: string | null
  is_business: number
  transfer_id: string | null
  parent_id: string | null
  imported_id: string | null
  import_source: string | null
  recurring_expense_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Tamanho da página. Não é enfeite: no D1 "rows read" conta linha
 * ESCANEADA, então nenhuma listagem desta tela roda sem teto — e o
 * "carregar mais" existe justamente pra o dono decidir quando pagar por
 * mais linhas, em vez de a tela decidir por ele.
 */
export const PAGINA = 30

/** Teto duro de `listTransactions` (`src/domain/transactions.ts`). */
const TETO_LIMITE = 500

/**
 * O cursor de KEYSET tem TRÊS partes, sempre.
 *
 * ⚠️ `(purchase_date, created_at)` NÃO é único — `createInstallmentPlan`
 * grava as N parcelas com os DOIS iguais, e `createTransfer` faz o mesmo
 * com as duas pernas. Com cursor de duas partes, paginar 6 parcelas de 2
 * em 2 devolve 4: as irmãs do grupo onde a página terminou somem, sem
 * erro nenhum, num EXTRATO (medido no backend, ver CLAUDE.md §
 * "Paginação do extrato"). `id` fecha a ordem total.
 */
export function cursorDe(t: TransactionView): string {
  return `${t.purchase_date}|${t.created_at}|${t.id}`
}

/**
 * O que ainda falta sair (e entrar) nas linhas dadas.
 *
 * ⚠️ **A tela respondia ao filtro "só o que falta marcar como pago" com uma
 * CONTAGEM de linhas ("15 lançamento(s) carregado(s)"), e a pergunta do
 * filtro é *quanto*.** Saber que faltam 15 lançamentos não diz se falta R$ 90
 * ou R$ 9.000 — e é esse número que decide se o dono tem como pagar a semana.
 *
 * ⚠️ **Saída e entrada ficam SEPARADAS, nunca um saldo líquido.** Somar tudo
 * com sinal daria "R$ -1.200" pra uma tela cujo rótulo é "falta pagar":
 * uma receita ainda não recebida abateria uma despesa ainda não paga, e a
 * dívida real apareceria menor do que é. `falta_sair` é a soma das
 * MAGNITUDES dos negativos; `falta_entrar`, a dos positivos.
 *
 * Não arredonda e não converte: centavos inteiros ponta a ponta, via
 * `sumCents` (`@piluvitu/tools/money`) — nunca `reduce` com `+` solto.
 */
export function totaisPendentes(linhas: TransactionView[]): {
  falta_sair_cents: number
  falta_entrar_cents: number
} {
  return {
    falta_sair_cents: sumCents(
      linhas.filter((t) => t.amount_cents < 0).map((t) => -t.amount_cents),
    ),
    falta_entrar_cents: sumCents(
      linhas.filter((t) => t.amount_cents > 0).map((t) => t.amount_cents),
    ),
  }
}

/** `2026-07-28` (ou o timestamp completo de `settled_at`) → `28/07/2026`. */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * O que apagar ESTA linha faz — nunca um "tem certeza?" genérico.
 *
 * ⚠️ Só duas classes são deriváveis no cliente, e as duas vêm de coluna
 * que já viaja em toda linha: transferência (`transfer_id`) e linha
 * importada (`imported_id`). As demais (parcela, pagamento de dívida,
 * rateio) exigiriam `inspectTransaction`, que **não tem porta HTTP** —
 * `GET /api/transactions/:id` não existe (registrado no CLAUDE.md). Por
 * isso o texto genérico diz, sem rodeio, que o servidor pode recusar e
 * vai dizer por onde apagar: prometer que "vai apagar" e receber um 422
 * seria pior que avisar antes.
 */
export function mensagemDeExclusao(t: TransactionView): string {
  if (t.transfer_id !== null) {
    return `Apagar "${t.description}"? É uma transferência: as DUAS pernas somem juntas — a saída e a entrada. Apagar só um lado deixaria a outra órfã e os saldos errados, então não é oferecido.`
  }
  if (t.imported_id !== null) {
    return `Apagar "${t.description}"? Esta linha veio de um import, e apagar NÃO a bloqueia: reimportar o mesmo arquivo traz a linha de volta (a deduplicação é por conta + id do arquivo, e o id some junto com a linha).`
  }
  return `Apagar "${t.description}"? Some do extrato, dos saldos e dos relatórios, e não dá pra desfazer. Se a linha pertencer a um parcelamento, a um pagamento de dívida ou a um rateio, o servidor recusa e diz por onde apagar.`
}

type ConfirmacaoPendente = {
  titulo: string
  mensagem: string
  onConfirm: () => void | Promise<void>
}

/** Erro de UMA ação, preso à LINHA em que a ação foi disparada. */
type ErroDeLinha = { id: string; mensagem: string }

type FormEdicao = {
  descricao: string
  /** MAGNITUDE, sem sinal — quem carrega o sinal é `entrada`. */
  valor: string
  entrada: boolean
  data: string
  contaId: string
  categoriaId: string
  pj: boolean
}

/**
 * ⚠️ O sinal do valor NÃO é digitado — é o checkbox "Entrada", exatamente
 * como a tela Lançar (`new-entry.tsx:122`, `entrada ? total : -total`).
 *
 * O campo nascia com `formatBRL(t.amount_cents)` (`-R$ 13.600,00`) e exigia
 * que o dono redigitasse o `-` junto com o valor novo. MEDIDO ponta a ponta:
 * campo `-R$ 13.600,00` → digitado `12.000,00` → `PATCH {"amount_cents":
 * 1200000}` POSITIVO, sem erro nenhum (o servidor aceita qualquer inteiro
 * != 0). A despesa virava entrada: o saldo errava 2× o valor, a linha sumia
 * de `byCategory` (que filtra `amount_cents < 0`) e passava a contar como
 * "entrou" no fluxo de caixa. A ajuda que existia ("-1.360,00 (saída) ou
 * 1.360,00") só aparecia quando o parse FALHAVA — nunca no caso perigoso,
 * que é o parse ACERTAR com o sinal errado.
 */
function formDe(t: TransactionView): FormEdicao {
  return {
    descricao: t.description,
    valor: formatBRL(Math.abs(t.amount_cents)),
    entrada: t.amount_cents > 0,
    data: t.purchase_date,
    contaId: t.account_id,
    categoriaId: t.category_id ?? '',
    pj: t.is_business === 1,
  }
}

export function ExtratoPage() {
  const [linhas, setLinhas] = useState<TransactionView[] | null>(null)
  const [contas, setContas] = useState<AccountView[]>([])
  const [categorias, setCategorias] = useState<CategoryOption[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [temMais, setTemMais] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)

  const [somenteNaoPagos, setSomenteNaoPagos] = useState(false)
  const [busca, setBusca] = useState('')

  /**
   * Erro de PÁGINA — o que não pertence a nenhuma linha: a busca de
   * contas/categorias e o "carregar mais".
   */
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  /**
   * ⚠️ Erro de LINHA, renderizado DENTRO da linha que falhou — nunca no topo
   * da página.
   *
   * As três mutações (apagar, editar, liquidar) escreviam num `<p>` único lá
   * em cima. MEDIDO no Chrome real a 390×844, com 30 linhas e um DELETE
   * recusado (422 `transaction_has_owner`) na linha t28:
   * `{top:-3828, bottom:-3788, scrollY:4181, visivelNoViewport:false}` — a
   * recusa renderizava 3.828 px ACIMA do viewport, e pro dono o botão
   * "apagar" simplesmente não fazia nada.
   *
   * Isso anulava a decisão CENTRAL da fatia: a mensagem vem crua do domínio
   * porque é ELA que nomeia a porta certa ("cancele o parcelamento
   * inteiro", "use DELETE /api/debts/:id/payments/:paymentId"). Uma
   * mensagem que ninguém vê não nomeia nada.
   *
   * Por que inline por linha, e não `scrollIntoView` no `<p>` do topo: o
   * dedo do dono está NA LINHA, e rolar a página inteira até o topo tira
   * dele o lugar onde estava (com 30+ linhas ele perde a referência do que
   * tocou); e a mensagem do domínio é uma frase inteira, que no topo fica
   * longe da ação que a provocou. Aqui ela nasce a poucos pixels do botão,
   * sem mover nada. `role="alert"` continua (leitor de tela segue sendo
   * avisado) — só mudou ONDE o elemento vive.
   */
  const [erroLinha, setErroLinha] = useState<ErroDeLinha | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(
    null,
  )

  const [liquidando, setLiquidando] = useState<string | null>(null)
  const [dataLiquidacao, setDataLiquidacao] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<FormEdicao | null>(null)

  // Quantas páginas já foram pedidas. Fica num ref (não em estado) porque
  // `recarregar` precisa lê-lo sem virar uma dependência que se troca a
  // cada "carregar mais" — trocar a identidade de `recarregar` a cada
  // página faria o efeito de carga inicial rodar de novo e jogar fora
  // exatamente as páginas que o dono acabou de pedir.
  const paginasRef = useRef(1)

  /**
   * Recarrega a lista inteira do começo, PRESERVANDO quantas páginas o
   * dono já tinha pedido (`limit = PAGINA * páginas`, capado no teto do
   * servidor). É o `recarregar` de toda mutação: sem preservar, marcar
   * como pago uma linha da 3ª página jogaria o dono de volta pra 1ª,
   * fazendo uma ação bem-sucedida parecer que "perdeu" o resto da lista.
   */
  const recarregar = useCallback(
    async (vivo: () => boolean = () => true) => {
      const limite = Math.min(PAGINA * paginasRef.current, TETO_LIMITE)
      const qs = new URLSearchParams({ limit: String(limite) })
      if (somenteNaoPagos) qs.set('settled', '0')
      const rows = await api<TransactionView[]>(`/api/transactions?${qs}`)
      if (!vivo()) return
      setLinhas(rows)
      setTemMais(rows.length === limite)
    },
    [somenteNaoPagos],
  )

  useEffect(() => {
    let vivo = true
    setLinhas(null)
    recarregar(() => vivo).catch((e: unknown) => {
      if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
  }, [recarregar])

  useEffect(() => {
    let vivo = true
    Promise.all([
      api<AccountView[]>('/api/accounts'),
      api<CategoryOption[]>('/api/categories'),
    ])
      .then(([cts, cats]) => {
        if (!vivo) return
        setContas(cts)
        setCategorias(cats)
      })
      .catch((e: unknown) => {
        // Conta/categoria são só os NOMES ao lado de cada linha e as
        // opções de edição — o extrato em si continua legível sem eles,
        // então esta falha não pode derrubar a tela.
        if (vivo) setAcaoErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  const nomeConta = useCallback(
    (id: string) => contas.find((c) => c.id === id)?.name ?? '—',
    [contas],
  )
  const nomeCategoria = useCallback(
    (id: string | null) =>
      id === null
        ? 'Sem categoria'
        : (categorias.find((c) => c.id === id)?.name ?? 'Sem categoria'),
    [categorias],
  )

  /**
   * Busca textual no CLIENTE, sobre o que já foi carregado — nunca no
   * servidor. `LIKE %x%` não é sargable: viraria varredura da tabela
   * inteira a cada tecla, e "rows read" é o que o D1 cobra.
   */
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (linhas === null) return []
    if (termo === '') return linhas
    return linhas.filter((t) =>
      `${t.description} ${nomeConta(t.account_id)} ${nomeCategoria(t.category_id)}`
        .toLowerCase()
        .includes(termo),
    )
  }, [linhas, busca, nomeConta, nomeCategoria])

  const pendentes = useMemo(() => totaisPendentes(visiveis), [visiveis])

  async function carregarMais() {
    const carregadas = linhas ?? []
    const ultima = carregadas[carregadas.length - 1]
    if (!ultima) return
    setAcaoErro(null)
    setCarregandoMais(true)
    try {
      const qs = new URLSearchParams({
        limit: String(PAGINA),
        before: cursorDe(ultima),
      })
      if (somenteNaoPagos) qs.set('settled', '0')
      const rows = await api<TransactionView[]>(`/api/transactions?${qs}`)
      setLinhas([...carregadas, ...rows])
      paginasRef.current += 1
      setTemMais(rows.length === PAGINA)
    } catch (e: unknown) {
      setAcaoErro(e instanceof ApiError ? e.message : String(e))
    }
    setCarregandoMais(false)
  }

  function trocarFiltro(valor: boolean) {
    paginasRef.current = 1
    setAcaoErro(null)
    setErroLinha(null)
    setSomenteNaoPagos(valor)
  }

  function abrirLiquidacao(t: TransactionView) {
    setEditando(null)
    setErroLinha(null)
    setLiquidando(t.id)
    // ⚠️ `todayInTeresina()`, NUNCA `new Date().toISOString()`: às 22h de
    // Teresina o UTC já virou o dia seguinte, e a data escolhida sairia um
    // dia à frente — o mesmo bug de fuso que este módulo já pagou três
    // vezes. E é DATA que o dono escolhe ("paguei no dia X"), não o
    // instante do clique.
    setDataLiquidacao(todayInTeresina())
  }

  async function confirmarLiquidacao(t: TransactionView) {
    setErroLinha(null)
    setProcessando(t.id)
    const resultado = await mutarERecarregar(
      () =>
        api(`/api/transactions/${t.id}/settle`, {
          method: 'POST',
          body: JSON.stringify({ settled_at: dataLiquidacao }),
        }),
      recarregar,
      `"${t.description}" foi marcado como pago em ${formatarData(dataLiquidacao)}, mas não consegui recarregar a lista — atualize a página pra vê-la. Não clique de novo: a segunda tentativa responde "não encontrado ou já liquidado" e pareceria falha.`,
    )
    if (!resultado.ok) setErroLinha({ id: t.id, mensagem: resultado.mensagem })
    setProcessando(null)
    setLiquidando(null)
  }

  function abrirEdicao(t: TransactionView) {
    setLiquidando(null)
    setErroLinha(null)
    setEditando(t.id)
    setForm(formDe(t))
  }

  async function salvarEdicao(t: TransactionView) {
    if (form === null) return
    setErroLinha(null)

    // Só o que MUDOU entra no corpo. Não é economia de bytes: mandar
    // `amount_cents` inalterado numa parcela faria o servidor recusar
    // (nível B em linha com dono) uma edição que só trocava a categoria —
    // e corrigir a categoria de uma parcela é exatamente o que o dono
    // precisa poder fazer.
    const patch: Record<string, unknown> = {}
    if (form.descricao.trim() === '') {
      setErroLinha({ id: t.id, mensagem: 'Descreva o lançamento.' })
      return
    }
    if (form.descricao !== t.description) patch.description = form.descricao
    if (form.categoriaId !== (t.category_id ?? ''))
      patch.category_id = form.categoriaId === '' ? null : form.categoriaId
    if ((form.pj ? 1 : 0) !== t.is_business) patch.is_business = form.pj ? 1 : 0
    if (form.data !== t.purchase_date) patch.purchase_date = form.data
    if (form.contaId !== t.account_id) patch.account_id = form.contaId

    // ⚠️ O campo guarda a MAGNITUDE; o sinal vem do checkbox "Entrada" —
    // mesmo precedente da tela Lançar (`new-entry.tsx:122`). Um `-` digitado
    // é RECUSADO em vez de silenciosamente absorvido: ele significaria que o
    // dono ainda acha que o sinal se digita aqui, e `Math.abs()` calado
    // deixaria essa crença de pé até a próxima edição.
    let magnitude: number
    try {
      magnitude = parseBRL(form.valor)
    } catch {
      setErroLinha({
        id: t.id,
        mensagem:
          'Valor inválido. Digite só o número (ex.: 1.360,00) — quem decide se entrou ou saiu é o "Entrada" logo abaixo.',
      })
      return
    }
    if (magnitude <= 0) {
      setErroLinha({
        id: t.id,
        mensagem:
          'Digite o valor sem sinal (ex.: 1.360,00) e marque "Entrada" se o dinheiro ENTROU. Sem marcar, é saída.',
      })
      return
    }
    const valorCents = form.entrada ? magnitude : -magnitude
    // Só entra no corpo se de fato MUDOU: mandar `amount_cents` inalterado
    // numa parcela faria o servidor recusar (nível B) uma edição que só
    // trocava a categoria.
    if (valorCents !== t.amount_cents) patch.amount_cents = valorCents

    if (Object.keys(patch).length === 0) {
      setEditando(null)
      return
    }

    setProcessando(t.id)
    const resultado = await mutarERecarregar(
      () =>
        api(`/api/transactions/${t.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }),
      recarregar,
      `"${t.description}" foi corrigido, mas não consegui recarregar a lista — atualize a página pra ver o valor novo. Não envie de novo: a tela ainda mostra o valor ANTIGO, e reenviar gravaria por cima do que você acabou de salvar.`,
    )
    if (!resultado.ok) {
      setErroLinha({ id: t.id, mensagem: resultado.mensagem })
      // A recusa de nível B (`protected_field`) nomeia a porta certa
      // ("cancele o parcelamento inteiro"...) — o formulário fica aberto
      // pro dono desfazer a mudança que foi recusada, em vez de sumir
      // levando junto o que ele digitou.
      if (resultado.fase === 'recarga') setEditando(null)
    } else {
      setEditando(null)
    }
    setProcessando(null)
  }

  function apagar(t: TransactionView) {
    setConfirmacao({
      titulo: 'Apagar lançamento',
      mensagem: mensagemDeExclusao(t),
      onConfirm: async () => {
        setErroLinha(null)
        setProcessando(t.id)
        const resultado = await mutarERecarregar(
          () => api(`/api/transactions/${t.id}`, { method: 'DELETE' }),
          recarregar,
          `"${t.description}" foi apagado, mas não consegui recarregar a lista — atualize a página pra vê-la sem ele. Não clique de novo: a segunda tentativa responde "não encontrado" e pareceria falha.`,
        )
        if (!resultado.ok)
          setErroLinha({ id: t.id, mensagem: resultado.mensagem })
        setProcessando(null)
      },
    })
  }

  /**
   * O conteúdo da linha + o erro DAQUELA linha, logo abaixo da ação que
   * falhou (ver o comentário de `erroLinha` lá em cima pro porquê).
   */
  function corpoDaLinha(t: TransactionView) {
    return (
      <>
        {conteudoDaLinha(t)}
        {erroLinha !== null && erroLinha.id === t.id ? (
          <p
            role="alert"
            data-testid={`erro-linha-${t.id}`}
            className="text-destructive mt-2 text-sm"
            // ⚠️ `block: 'nearest'` rola o MÍNIMO, e só quando o alerta está
            // fora da vista. É o que fecha o residual medido no fix round: o
            // erro inline nasce logo abaixo do botão, e quando o botão tocado
            // está na faixa inferior da tela (a zona do polegar) o alerta cai
            // fora do viewport. MEDIDO no Chrome real a 390x844, 30 linhas:
            // botão em `bottom:844` => alerta em `top:852`, **0 px visíveis**;
            // só fica inteiro com o botão em `bottom <= 714`.
            //
            // ⚠️ NÃO é `'center'`/`'start'`: eles rolam SEMPRE, inclusive
            // quando o alerta já estava visível, e tirar o dono do lugar onde
            // ele tocou foi exatamente o motivo de descartar `scrollIntoView`
            // genérico e escolher o erro inline. `'nearest'` é no-op quando já
            // está visível — mantém a propriedade "não move nada" no caso
            // comum, e conserta só o caso que quebrava.
            ref={(el) => {
              el?.scrollIntoView({ block: 'nearest' })
            }}
          >
            {erroLinha.mensagem}
          </p>
        ) : null}
      </>
    )
  }

  function conteudoDaLinha(t: TransactionView) {
    if (editando === t.id && form !== null) {
      return (
        <form
          data-testid={`form-edicao-${t.id}`}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void salvarEdicao(t)
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`ed-desc-${t.id}`}>Descrição</Label>
            <Input
              id={`ed-desc-${t.id}`}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ed-cat-${t.id}`}>Categoria</Label>
            <select
              id={`ed-cat-${t.id}`}
              className={SELECT_CLASSNAME}
              value={form.categoriaId}
              onChange={(e) =>
                setForm({ ...form, categoriaId: e.target.value })
              }
            >
              <option value="">— sem categoria —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={CHECKBOX_CLASSNAME}
              checked={form.pj}
              onChange={(e) => setForm({ ...form, pj: e.target.checked })}
            />
            PJ
          </label>

          {/* ⚠️ Valor SEM sinal + checkbox "Entrada" — o mesmo jeito de a
              tela Lançar representar sinal (`new-entry.tsx`), nunca um
              terceiro. Digitar o `-` já custou uma despesa virando entrada
              em silêncio (ver `formDe`). */}
          <div className="space-y-1.5">
            <Label htmlFor={`ed-valor-${t.id}`}>Valor</Label>
            <Input
              id={`ed-valor-${t.id}`}
              value={form.valor}
              placeholder="1.360,00"
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={CHECKBOX_CLASSNAME}
              data-testid={`ed-entrada-${t.id}`}
              checked={form.entrada}
              onChange={(e) => setForm({ ...form, entrada: e.target.checked })}
            />
            Entrada (dinheiro que ENTROU; sem marcar, é saída)
          </label>
          <div className="space-y-1.5">
            <Label htmlFor={`ed-data-${t.id}`}>Data</Label>
            <Input
              id={`ed-data-${t.id}`}
              type="date"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ed-conta-${t.id}`}>Conta</Label>
            <select
              id={`ed-conta-${t.id}`}
              className={SELECT_CLASSNAME}
              value={form.contaId}
              onChange={(e) => setForm({ ...form, contaId: e.target.value })}
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <p className="text-muted-foreground text-xs">
            Valor, data e conta só mudam numa linha livre. Numa parcela, num
            pagamento de dívida ou num rateio o servidor recusa e diz por onde
            fazer — descrição, categoria e PJ continuam editáveis nos três.
          </p>

          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={processando === t.id}
              data-testid={`salvar-${t.id}`}
            >
              {processando === t.id ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditando(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )
    }

    return (
      <>
        <p className="font-medium">{t.description}</p>
        <p className="text-muted-foreground text-xs">
          {nomeConta(t.account_id)} · {nomeCategoria(t.category_id)}
          {t.is_business === 1 ? ' · PJ' : ''}
        </p>
        {/*
          Status como CHIP, não texto solto — `regras.tsx` já era a
          referência (`<Badge>Pausada</Badge>`) e outras 5 telas já usavam
          badge. `badgeVariants` num `<span>`, não o componente `Badge`:
          ele renderiza um `<div>`, e aqui o pai é um `<p>`/`<td>` — div
          dentro de p faz o navegador fechar o parágrafo sozinho e o layout
          quebra (lição já paga em `recorrentes.tsx`).
        */}
        <span
          className={cn(
            badgeVariants({
              variant: t.settled_at === null ? 'outline' : 'secondary',
            }),
            'mt-1',
          )}
          data-testid={`estado-${t.id}`}
        >
          {t.settled_at === null
            ? 'falta marcar como pago'
            : `pago em ${formatarData(t.settled_at)}`}
        </span>

        {liquidando === t.id ? (
          <div
            className="mt-2 space-y-2 rounded-md border p-2"
            data-testid={`liquidar-form-${t.id}`}
          >
            <Label htmlFor={`liq-data-${t.id}`}>Pago em</Label>
            <Input
              id={`liq-data-${t.id}`}
              type="date"
              value={dataLiquidacao}
              onChange={(e) => setDataLiquidacao(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={processando === t.id}
                data-testid={`confirmar-pago-${t.id}`}
                onClick={() => void confirmarLiquidacao(t)}
              >
                {processando === t.id ? 'Marcando…' : 'Confirmar'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLiquidando(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          // ⚠️ Duas correções na MESMA linha de ações, e as duas foram
          // MEDIDAS em Chrome real a 390×844 (Android do dono):
          //
          // 1. **Tamanho.** `apagar` media 40×16 px e `editar` 33,7×16 —
          //    contra os 44×44 recomendados —, repetidos em 30 linhas.
          //    `ALVO_LINK` leva os dois a 44 px de altura SEM mexer na fonte
          //    nem deslocar o texto (ver `lib/touch.ts`).
          // 2. **Distância.** `apagar` ficava a 12 px de `editar`: o alvo
          //    destrutivo colado no alvo de uso rotineiro. `ml-auto` empurra
          //    `apagar` pra outra ponta da linha — a separação passa a ser o
          //    espaço que sobrar, e errar `editar` deixa de significar
          //    "apaguei dinheiro". `justify-start` + `ml-auto` faz isso sem
          //    coluna nova e sem reordenar nada pro leitor de tela.
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {t.settled_at === null ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className={cn('h-auto p-0 text-xs no-underline', ALVO_LINK)}
                data-testid={`marcar-pago-${t.id}`}
                onClick={() => abrirLiquidacao(t)}
              >
                marcar como pago
              </Button>
            ) : null}
            <Button
              type="button"
              variant="link"
              size="sm"
              className={cn('h-auto p-0 text-xs no-underline', ALVO_LINK)}
              data-testid={`editar-${t.id}`}
              onClick={() => abrirEdicao(t)}
            >
              editar
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              className={cn(
                'text-destructive h-auto p-0 text-xs no-underline',
                ALVO_LINK_FIM,
              )}
              data-testid={`apagar-${t.id}`}
              disabled={processando === t.id}
              onClick={() => apagar(t)}
            >
              apagar
            </Button>
          </div>
        )}
      </>
    )
  }

  // ⚠️ `tabular-nums`: sem ela os dígitos têm larguras diferentes e uma
  // coluna de dinheiro deixa de alinhar — o app só tinha essa classe em
  // UM lugar (`blocos/GraficoComprometido.tsx`), e aqui a coluna existe
  // pra ser lida de cima a baixo.
  const classeValor = (t: TransactionView) =>
    cn(
      'font-medium tabular-nums',
      t.amount_cents < 0 ? 'text-foreground' : 'text-primary',
    )

  const menorQueSm = useMenorQueSm()

  return (
    <section className="space-y-6" data-testid="pagina-extrato">
      {/*
        O `<h1>` saiu daqui pra top bar (`App.tsx`); a Ajuda continua na tela,
        agora presa ao subtítulo — é onde ela explica o que a linha de texto
        ao lado resume. `gap-3` porque a área de toque do gatilho avança 12 px
        pra cada lado do círculo (ver `packages/ui/CLAUDE.md`).
      */}
      <div className="flex items-center gap-3">
        <p className="text-muted-foreground text-sm">
          Confira, corrija, marque como pago ou apague um lançamento.
        </p>
        <Ajuda rotulo="Extrato">
          Todo lançamento, do mais recente pro mais antigo. "Falta marcar como
          pago" é o que ainda não saiu (nem entrou) de fato de uma conta:
          continua como compromisso em Comprometido e só vira caixa no Fluxo
          depois de marcado. A busca filtra só o que já foi carregado — use
          "carregar mais" pra alcançar mais fundo.
        </Ajuda>
      </div>

      {erro !== null && (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      )}
      {/* Só o que NÃO pertence a nenhuma linha mora aqui (nomes de
          conta/categoria, "carregar mais"). Falha de mutação vai pra dentro
          da linha — ver `erroLinha`. */}
      {acaoErro !== null && (
        <p
          role="alert"
          className="text-destructive text-sm"
          data-testid="acao-erro"
        >
          {acaoErro}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* O alvo real é o `<label>` inteiro (ele embrulha o input), não o
              quadradinho de 13,6×16 px — `ALVO_LINHA` só garante que a faixa
              tenha os 44 px de altura. */}
          <label className={cn(ALVO_LINHA, 'gap-2 text-sm')}>
            <input
              type="checkbox"
              className={CHECKBOX_CLASSNAME}
              data-testid="filtro-nao-pagos"
              checked={somenteNaoPagos}
              onChange={(e) => trocarFiltro(e.target.checked)}
            />
            Só o que falta marcar como pago
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="busca">Buscar (no que já carregou)</Label>
            <Input
              id="busca"
              value={busca}
              placeholder="descrição, conta ou categoria"
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {linhas === null ? (
            <p aria-busy="true" className="text-muted-foreground text-sm">
              Carregando…
            </p>
          ) : visiveis.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="vazio">
              {linhas.length > 0
                ? 'Nenhum lançamento carregado bate com essa busca. Tente "carregar mais" ou outro termo.'
                : somenteNaoPagos
                  ? 'Nada esperando pagamento por aqui — tudo que foi carregado já está marcado como pago.'
                  : 'Nenhum lançamento ainda. Registre o primeiro em Lançar.'}
            </p>
          ) : menorQueSm ? (
            <ul className="space-y-3" data-testid="extrato-cards">
              {visiveis.map((t) => (
                <li
                  key={t.id}
                  data-testid={`linha-${t.id}`}
                  className="rounded-md border p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatarData(t.purchase_date)}
                    </span>
                    <span
                      data-testid={`valor-${t.id}`}
                      className={classeValor(t)}
                    >
                      {formatBRL(t.amount_cents)}
                    </span>
                  </div>
                  <div className="mt-1">{corpoDaLinha(t)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse text-sm"
                data-testid="extrato-tabela"
              >
                <thead>
                  <tr>
                    <th
                      className={cn(ROTULO, 'border-b py-1.5 pr-2 text-left')}
                    >
                      Data
                    </th>
                    <th
                      className={cn(ROTULO, 'border-b px-2 py-1.5 text-left')}
                    >
                      Lançamento
                    </th>
                    <th
                      className={cn(ROTULO, 'border-b py-1.5 pl-2 text-right')}
                    >
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((t) => (
                    <tr key={t.id} data-testid={`linha-${t.id}`}>
                      <td className="border-b py-1.5 pr-2 align-top whitespace-nowrap tabular-nums">
                        {formatarData(t.purchase_date)}
                      </td>
                      <td className="border-b px-2 py-1.5 align-top">
                        {corpoDaLinha(t)}
                      </td>
                      <td
                        data-testid={`valor-${t.id}`}
                        className={cn(
                          'border-b py-1.5 pl-2 text-right align-top whitespace-nowrap',
                          classeValor(t),
                        )}
                      >
                        {formatBRL(t.amount_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {linhas !== null && linhas.length > 0 ? (
            <div className="mt-4 space-y-1">
              {/*
                ⚠️ A SOMA só aparece com o filtro ligado, e é sobre `visiveis`
                (o que está na tela agora), nunca sobre `linhas`: com uma busca
                textual ativa, somar o que está escondido daria um número que
                não corresponde a nenhuma linha visível.

                ⚠️ **A lista é PAGINADA, e a frase diz isso.** Um total
                apresentado como se fosse o do mês inteiro seria um número
                errado com cara de certo — a mesma desonestidade que o teto de
                500 da dedupe do import evita dizendo o número em voz alta.
                Quando ainda há página por vir (`temMais`), o texto afirma que
                há mais lançamentos não carregados e aponta o "carregar mais";
                quando não há, ele afirma que cobre tudo que bate com o filtro.
              */}
              {somenteNaoPagos ? (
                <p
                  className="text-foreground text-sm font-medium"
                  data-testid="total-pendente"
                >
                  Falta pagar{' '}
                  <span className="tabular-nums">
                    {formatBRL(pendentes.falta_sair_cents)}
                  </span>
                  {pendentes.falta_entrar_cents > 0 ? (
                    <>
                      {' '}
                      · falta entrar{' '}
                      <span className="tabular-nums">
                        {formatBRL(pendentes.falta_entrar_cents)}
                      </span>
                    </>
                  ) : null}
                </p>
              ) : null}
              <p
                className="text-muted-foreground text-xs"
                data-testid="resumo-carregado"
              >
                {visiveis.length === linhas.length
                  ? `${linhas.length} lançamento(s) carregado(s).`
                  : `${visiveis.length} de ${linhas.length} lançamento(s) carregado(s).`}
                {somenteNaoPagos
                  ? temMais
                    ? ' A soma acima é só do que carregou até aqui — há mais lançamentos, use "carregar mais".'
                    : ' A soma acima cobre tudo que falta marcar como pago (até o teto de 500 lançamentos).'
                  : ''}
              </p>
            </div>
          ) : null}

          {/* Paginação KEYSET, e com FIM: o botão some quando a última
              página veio incompleta. Rolagem infinita sem fim escondida
              queimaria cota de "rows read" sem o dono pedir. */}
          {temMais ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              data-testid="carregar-mais"
              disabled={carregandoMais}
              onClick={() => void carregarMais()}
            >
              {carregandoMais ? 'Carregando…' : 'Carregar mais'}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* Confirmação via `Dialog` do design system, NUNCA `window.confirm()`
          — o Chrome Android passa a devolver `false` em silêncio depois de
          "impedir caixas de diálogo adicionais", e os botões ficariam
          inertes até um F5, sem nada na tela avisando por quê. */}
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
