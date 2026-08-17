import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import type { Regra } from '@piluvitu/tools/regras'
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
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { CHECKBOX_CLASSNAME, SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import type { AccountView } from './accounts'
import type { CategoryOption } from './recorrentes'

/**
 * Tela de regras de categorização (fase 1). Molde de `recorrentes.tsx`:
 * lista + UM formulário reusado pra criar/editar (`editandoId`) + `Dialog`
 * do design system pra confirmar a exclusão — ⚠️ **nunca
 * `window.confirm()`** (o modo de falha medido no Chrome Android, ver
 * `debt-detail.tsx`).
 *
 * ⚠️ **A COLUNA "casaria" É O QUE FAZ ESTA TELA VALER ALGUMA COISA.** Uma
 * regra cujo efeito o dono não consegue prever é uma regra que ele não vai
 * confiar — e ele não tem como adivinhar que "MERCADO" pega 40 linhas e não
 * as 3 que ele imaginou. `GET /api/rules/matches` conta contra os
 * lançamentos que já existem, com o MESMO matcher que o import vai usar
 * (`@piluvitu/tools/regras`), e a tela diz o tamanho da janela varrida em
 * vez de vender o número como "o histórico inteiro".
 */

type MatchesView = {
  scanned: number
  counts: Record<string, number>
  scan_limit: number
}

type PayeeOption = { id: string; name: string }

type ConfirmacaoPendente = {
  titulo: string
  mensagem: string
  onConfirm: () => void | Promise<void>
}

const NENHUMA = ''

// Sem prefixo 'R$ ' no campo — mesmo padrão de pages/config.tsx#paraCampo.
function paraCampo(cents: number | null): string {
  return cents === null ? '' : formatBRL(cents).replace('R$ ', '')
}

const FORM_INICIAL = {
  nome: '',
  texto: '',
  contaId: NENHUMA,
  valorMin: '',
  valorMax: '',
  direcao: NENHUMA as '' | 'expense' | 'income',
  categoriaId: NENHUMA,
  payeeId: NENHUMA,
  marcaPj: false,
  valorPj: '1' as '0' | '1',
  prioridade: '100',
  ativa: true,
}

/**
 * Resume as CONDIÇÕES de uma regra numa frase que o dono lê sem abrir o
 * formulário. Exportada pra ter teste próprio: é a única coisa da tela que
 * traduz o schema pra português, e errar aqui faz a lista mentir sobre o
 * que a regra faz.
 */
export function descreverCondicoes(
  r: Regra,
  nomeConta: (id: string) => string | null,
): string {
  const partes: string[] = []
  if (r.match_text !== null) partes.push(`descrição contém "${r.match_text}"`)
  if (r.match_account_id !== null)
    partes.push(`na conta ${nomeConta(r.match_account_id) ?? '(removida)'}`)
  if (r.match_min_cents !== null && r.match_max_cents !== null)
    partes.push(
      `valor entre ${formatBRL(r.match_min_cents)} e ${formatBRL(r.match_max_cents)}`,
    )
  else if (r.match_min_cents !== null)
    partes.push(`valor a partir de ${formatBRL(r.match_min_cents)}`)
  else if (r.match_max_cents !== null)
    partes.push(`valor até ${formatBRL(r.match_max_cents)}`)
  if (r.match_direction !== null)
    partes.push(r.match_direction === 'expense' ? 'só saídas' : 'só entradas')
  return partes.join(' · ')
}

/** Resume as AÇÕES. Mesmo motivo de `descreverCondicoes` ser exportada. */
export function descreverAcoes(
  r: Regra,
  nomeCategoria: (id: string) => string | null,
  nomePayee: (id: string) => string | null,
): string {
  const partes: string[] = []
  if (r.set_category_id !== null)
    partes.push(
      `categoria → ${nomeCategoria(r.set_category_id) ?? '(arquivada ou removida)'}`,
    )
  if (r.set_payee_id !== null)
    partes.push(`favorecido → ${nomePayee(r.set_payee_id) ?? '(removido)'}`)
  // ⚠️ `0` é uma AÇÃO ("marque PF"), não ausência — por isso a comparação é
  // com `null`, nunca um `if (r.set_is_business)` que trataria 0 como
  // "não faz nada" e sumiria com a metade PF da regra na listagem.
  if (r.set_is_business !== null)
    partes.push(r.set_is_business === 1 ? 'marca PJ' : 'marca PF')
  return partes.join(' · ')
}

export function RegrasPage() {
  const [regras, setRegras] = useState<Regra[] | null>(null)
  const [categorias, setCategorias] = useState<CategoryOption[]>([])
  const [contas, setContas] = useState<AccountView[]>([])
  const [payees, setPayees] = useState<PayeeOption[]>([])
  const [matches, setMatches] = useState<MatchesView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nome, setNome] = useState(FORM_INICIAL.nome)
  const [texto, setTexto] = useState(FORM_INICIAL.texto)
  const [contaId, setContaId] = useState(FORM_INICIAL.contaId)
  const [valorMin, setValorMin] = useState(FORM_INICIAL.valorMin)
  const [valorMax, setValorMax] = useState(FORM_INICIAL.valorMax)
  const [direcao, setDirecao] = useState(FORM_INICIAL.direcao)
  const [categoriaId, setCategoriaId] = useState(FORM_INICIAL.categoriaId)
  const [payeeId, setPayeeId] = useState(FORM_INICIAL.payeeId)
  const [marcaPj, setMarcaPj] = useState(FORM_INICIAL.marcaPj)
  const [valorPj, setValorPj] = useState(FORM_INICIAL.valorPj)
  const [prioridade, setPrioridade] = useState(FORM_INICIAL.prioridade)
  const [ativa, setAtiva] = useState(FORM_INICIAL.ativa)
  const [formError, setFormError] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(
    null,
  )

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    const [rs, cats, cts, pys] = await Promise.all([
      api<Regra[]>('/api/rules'),
      api<CategoryOption[]>('/api/categories'),
      api<AccountView[]>('/api/accounts'),
      api<PayeeOption[]>('/api/payees'),
    ])
    if (!vivo()) return
    setRegras(rs)
    setCategorias(cats)
    setContas(cts)
    setPayees(pys)
  }, [])

  // ⚠️ A contagem é buscada num efeito SEPARADO e falha em SILÊNCIO. Um
  // `Promise.all` com a carga principal juntaria o destino dos dois: uma
  // varredura lenta (ou fora do ar) apagaria a lista de regras inteira,
  // que é a única coisa desta tela que o dono não consegue obter de outro
  // jeito. Mesmo precedente dos dois efeitos independentes de
  // `pages/insight.tsx` e das referências de `BlocoSaldos`/`BlocoCategorias`.
  const carregarMatches = useCallback(
    async (vivo: () => boolean = () => true) => {
      try {
        const m = await api<MatchesView>('/api/rules/matches')
        if (vivo()) setMatches(m)
      } catch {
        if (vivo()) setMatches(null)
      }
    },
    [],
  )

  useEffect(() => {
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
    })
    void carregarMatches(() => vivo)
    return () => {
      vivo = false
    }
  }, [carregar, carregarMatches])

  function limparFormulario() {
    setEditandoId(null)
    setNome(FORM_INICIAL.nome)
    setTexto(FORM_INICIAL.texto)
    setContaId(FORM_INICIAL.contaId)
    setValorMin(FORM_INICIAL.valorMin)
    setValorMax(FORM_INICIAL.valorMax)
    setDirecao(FORM_INICIAL.direcao)
    setCategoriaId(FORM_INICIAL.categoriaId)
    setPayeeId(FORM_INICIAL.payeeId)
    setMarcaPj(FORM_INICIAL.marcaPj)
    setValorPj(FORM_INICIAL.valorPj)
    setPrioridade(FORM_INICIAL.prioridade)
    setAtiva(FORM_INICIAL.ativa)
    setFormError(null)
  }

  function editar(r: Regra) {
    setEditandoId(r.id)
    setNome(r.name)
    setTexto(r.match_text ?? '')
    setContaId(r.match_account_id ?? NENHUMA)
    setValorMin(paraCampo(r.match_min_cents))
    setValorMax(paraCampo(r.match_max_cents))
    setDirecao(r.match_direction ?? NENHUMA)
    setCategoriaId(r.set_category_id ?? NENHUMA)
    setPayeeId(r.set_payee_id ?? NENHUMA)
    setMarcaPj(r.set_is_business !== null)
    setValorPj(r.set_is_business === 0 ? '0' : '1')
    setPrioridade(String(r.priority))
    setAtiva(r.active === 1)
    setFormError(null)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (nome.trim() === '') {
      setFormError(
        'Dê um nome para a regra — é por ele que você vai reconhecê-la na lista.',
      )
      return
    }

    let minCents: number | null = null
    let maxCents: number | null = null
    if (valorMin.trim() !== '') {
      minCents = parseBRL(valorMin)
      if (minCents === null || minCents <= 0) {
        setFormError('Valor mínimo inválido — use o formato 1.234,56.')
        return
      }
    }
    if (valorMax.trim() !== '') {
      maxCents = parseBRL(valorMax)
      if (maxCents === null || maxCents <= 0) {
        setFormError('Valor máximo inválido — use o formato 1.234,56.')
        return
      }
    }
    if (minCents !== null && maxCents !== null && maxCents < minCents) {
      setFormError('O valor máximo precisa ser maior ou igual ao mínimo.')
      return
    }

    const prio = Number(prioridade)
    if (!Number.isInteger(prio)) {
      setFormError('Ordem precisa ser um número inteiro.')
      return
    }

    // ⚠️ As duas guardas estruturais são checadas AQUI TAMBÉM, apesar de o
    // domínio e o schema já as terem. Não é redundância defensiva: sem
    // elas o dono só descobriria o problema depois de uma requisição, com
    // a mensagem do servidor — e a regra sem condição é justamente a que
    // recategorizaria o livro-caixa inteiro. Vale gastar zero round-trip
    // pra explicar isso na hora.
    const temCondicao =
      texto.trim() !== '' ||
      contaId !== NENHUMA ||
      minCents !== null ||
      maxCents !== null ||
      direcao !== NENHUMA
    if (!temCondicao) {
      setFormError(
        'A regra precisa de pelo menos uma condição (texto, conta, faixa de valor ou sinal) — sem nenhuma, ela casaria com TODOS os lançamentos.',
      )
      return
    }
    const temAcao = categoriaId !== NENHUMA || payeeId !== NENHUMA || marcaPj
    if (!temAcao) {
      setFormError(
        'A regra precisa de pelo menos uma ação (categoria, favorecido ou PJ/PF).',
      )
      return
    }

    const corpo = {
      name: nome.trim(),
      match_text: texto.trim() === '' ? null : texto.trim(),
      match_account_id: contaId === NENHUMA ? null : contaId,
      match_min_cents: minCents,
      match_max_cents: maxCents,
      match_direction: direcao === NENHUMA ? null : direcao,
      set_category_id: categoriaId === NENHUMA ? null : categoriaId,
      set_payee_id: payeeId === NENHUMA ? null : payeeId,
      set_is_business: marcaPj ? Number(valorPj) : null,
      priority: prio,
      active: ativa ? 1 : 0,
    }

    setSalvando(true)
    const editando = editandoId !== null
    const resultado = await mutarERecarregar(
      async () => {
        if (editandoId) {
          await api(`/api/rules/${editandoId}`, {
            method: 'PUT',
            body: JSON.stringify(corpo),
          })
        } else {
          await api('/api/rules', {
            method: 'POST',
            body: JSON.stringify(corpo),
          })
        }
        limparFormulario()
      },
      async (vivo?: () => boolean) => {
        await carregar(vivo)
        await carregarMatches(vivo)
      },
      editando
        ? `A regra "${nome.trim()}" foi salva, mas não consegui recarregar a lista — atualize a página pra confirmar.`
        : `A regra "${nome.trim()}" foi criada, mas não consegui recarregar a lista — atualize a página pra confirmar. Não envie de novo: criaria uma segunda regra igual, e as duas casariam as mesmas linhas.`,
    )
    if (!resultado.ok) setFormError(resultado.mensagem)
    setSalvando(false)
  }

  function excluir(r: Regra) {
    setConfirmacao({
      titulo: 'Excluir regra',
      mensagem: `Excluir "${r.name}"? Isso não mexe em nenhum lançamento já gravado — a categoria que a regra sugeriu no passado continua onde está. Só as próximas importações deixam de usá-la. Não há como desfazer; para desligar temporariamente, use "Pausar".`,
      onConfirm: async () => {
        setAcaoErro(null)
        setProcessando(r.id)
        const resultado = await mutarERecarregar(
          async () => {
            await api(`/api/rules/${r.id}`, { method: 'DELETE' })
            if (editandoId === r.id) limparFormulario()
          },
          async (vivo?: () => boolean) => {
            await carregar(vivo)
            await carregarMatches(vivo)
          },
          `A regra "${r.name}" foi excluída, mas não consegui recarregar a lista — atualize a página pra confirmar. Nenhum lançamento já gravado foi alterado.`,
        )
        if (!resultado.ok) setAcaoErro(resultado.mensagem)
        setProcessando(null)
      },
    })
  }

  async function alternarPausa(r: Regra) {
    setAcaoErro(null)
    setProcessando(r.id)
    const resultado = await mutarERecarregar(
      async () => {
        await api(`/api/rules/${r.id}`, {
          method: 'PUT',
          body: JSON.stringify({ active: r.active === 1 ? 0 : 1 }),
        })
      },
      async (vivo?: () => boolean) => {
        await carregar(vivo)
        await carregarMatches(vivo)
      },
      `A regra "${r.name}" foi ${r.active === 1 ? 'pausada' : 'reativada'}, mas não consegui recarregar a lista — atualize a página pra confirmar.`,
    )
    if (!resultado.ok) setAcaoErro(resultado.mensagem)
    setProcessando(null)
  }

  if (loadError) return <p role="alert">{loadError}</p>
  if (!regras) return <p>Carregando…</p>

  const nomeCategoria = (id: string) =>
    categorias.find((c) => c.id === id)?.name ?? null
  const nomeConta = (id: string) =>
    contas.find((c) => c.id === id)?.name ?? null
  const nomePayee = (id: string) =>
    payees.find((p) => p.id === id)?.name ?? null

  // ⚠️ **O FORMULÁRIO EXIBIA O OPOSTO DO QUE A REGRA FAZ.** Conta e categoria
  // neste app se **arquivam**, não se apagam — e `GET /api/accounts` /
  // `GET /api/categories` escondem arquivada, enquanto `rules` continua
  // apontando pra ela (arquivar não é `DELETE`, então o `ON DELETE CASCADE`
  // da 0009 nunca dispara). Sem estas duas opções sintéticas, o `<select>`
  // ficava sem `<option>` casando o valor e caía na PRIMEIRA — "Qualquer
  // conta" / "Não mexe" —, enquanto o estado seguia com o id arquivado:
  // salvar sem tocar em nada mandava `match_account_id: "a-arquivada"` por
  // baixo de um campo que dizia "Qualquer conta".
  //
  // ⚠️ O caso da CONTA é o mais grave, e é irônico: "a regra alarga sozinha,
  // em silêncio" é exatamente o que o CASCADE da 0009 foi escrito pra
  // impedir. O schema impede de verdade; era a TELA que exibia como se
  // tivesse acontecido — e o dono lê "Qualquer conta", acredita, e salva.
  //
  // **A escolha: MOSTRAR a opção arquivada, marcada e nomeada, com aviso — e
  // NÃO bloquear o salvamento.** Bloquear recusaria uma edição que não tem
  // nada a ver com o campo arquivado (renomear a regra, mudar a Ordem)
  // enquanto força uma decisão que o dono pode legitimamente não querer
  // tomar: uma regra "só no cartão X" continua CERTA depois de o cartão ser
  // arquivado — os lançamentos daquela conta continuam existindo, e a regra
  // continua casando exatamente eles. O que era inaceitável não é a regra
  // apontar pra uma conta arquivada, é a tela MENTIR sobre isso. A lista já
  // era honesta (`na conta (removida)`, `(arquivada ou removida)`); o
  // formulário agora também é, e o aviso nomeia a saída em vez de impô-la.
  const contaSumida =
    contaId !== NENHUMA && !contas.some((c) => c.id === contaId)
  const categoriaSumida =
    categoriaId !== NENHUMA && !categorias.some((c) => c.id === categoriaId)

  return (
    <section className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        Regras
        <Ajuda rotulo="Regras">
          Uma regra diz &quot;quando a linha for assim, categorize assim&quot; —
          e roda na conferência do import, antes de qualquer coisa ser gravada.
          Nada é adivinhado por um modelo: você escreve a regra, vê quais regras
          casaram cada linha, e troca o que quiser antes de confirmar. Quando
          duas regras mexem no mesmo campo, vence a de MAIOR número em
          &quot;Ordem&quot; — é por isso que a ordem é editável.
        </Ajuda>
      </h1>

      <p className="text-muted-foreground text-sm">
        As regras são aplicadas na conferência do import, da menor para a maior
        &quot;Ordem&quot;. Elas nunca gravam sozinhas.
      </p>

      {acaoErro ? (
        <p role="alert" className="text-destructive text-sm">
          {acaoErro}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {regras.length} regra(s)
            {matches
              ? ` · contagem sobre os ${matches.scanned} lançamento(s) mais recentes`
              : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {regras.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma regra ainda. Crie a primeira abaixo — por exemplo,
              &quot;descrição contém UBER → categoria Transporte&quot;.
            </p>
          ) : (
            <div className="divide-y">
              {regras.map((r) => (
                <div
                  key={r.id}
                  data-testid={`regra-${r.id}`}
                  className="space-y-1 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {r.active === 0 ? <Badge>Pausada</Badge> : null}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      Ordem {r.priority}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Se {descreverCondicoes(r, nomeConta)}
                  </p>
                  <p className="text-sm">
                    Então {descreverAcoes(r, nomeCategoria, nomePayee)}
                  </p>
                  {/* ⚠️ O número que faz o dono confiar (ou desconfiar) da
                      regra ANTES de rodar um import com ela ligada.

                      ⚠️ `GET /api/rules/matches` conta ativas E pausadas (ver
                      a decisão em `src/routes/rules.ts`), então a frase de uma
                      regra PAUSADA precisa dizer isso — a versão anterior
                      afirmava "Casaria N de M lançamento(s) já existentes."
                      ao lado do badge "Pausada", prometendo um efeito que a
                      regra hoje não tem. Filtrar as pausadas na rota teria
                      sido mais simples e PIOR: o número é justamente o que
                      responde "vale a pena reativar esta?", e uma regra
                      pausada é onde essa pergunta é feita. Corrigido o TEMPO
                      VERBAL, não a contagem. */}
                  <p
                    data-testid={`casaria-${r.id}`}
                    className="text-sm tabular-nums"
                  >
                    {matches
                      ? r.active === 1
                        ? `Casaria ${matches.counts[r.id] ?? 0} de ${matches.scanned} lançamento(s) já existentes.`
                        : `Pausada, não casa nada hoje — se reativada, casaria ${matches.counts[r.id] ?? 0} de ${matches.scanned} lançamento(s) já existentes.`
                      : 'Não consegui contar quantos lançamentos existentes ela casaria.'}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => editar(r)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={processando === r.id}
                      onClick={() => void alternarPausa(r)}
                    >
                      {r.active === 1 ? 'Pausar' : 'Reativar'}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={processando === r.id}
                      onClick={() => excluir(r)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editandoId ? 'Editar regra' : 'Nova regra'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="regra-nome">Nome</Label>
              <Input
                id="regra-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Uber → Transporte"
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Se…</legend>
              <div className="space-y-1.5">
                <Label htmlFor="regra-texto">Descrição contém</Label>
                <Input
                  id="regra-texto"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="UBER"
                />
                <p className="text-muted-foreground text-xs">
                  Ignora maiúsculas e acentos. Deixe em branco para não
                  restringir pelo texto.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="regra-conta">Conta</Label>
                <select
                  id="regra-conta"
                  className={SELECT_CLASSNAME}
                  value={contaId}
                  onChange={(e) => setContaId(e.target.value)}
                >
                  <option value={NENHUMA}>Qualquer conta</option>
                  {contaSumida ? (
                    <option value={contaId}>
                      Conta arquivada ou removida (mantida)
                    </option>
                  ) : null}
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {contaSumida ? (
                  <p
                    role="alert"
                    data-testid="regra-conta-arquivada"
                    className="text-destructive text-xs"
                  >
                    Esta regra está presa a uma conta arquivada, e vai continuar
                    assim se você salvar — ela ainda casa os lançamentos daquela
                    conta. Só escolha &quot;Qualquer conta&quot; se quiser mesmo
                    ALARGAR a regra para todas as contas.
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="regra-valor-min">Valor mínimo</Label>
                  <Input
                    id="regra-valor-min"
                    value={valorMin}
                    onChange={(e) => setValorMin(e.target.value)}
                    placeholder="50,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="regra-valor-max">Valor máximo</Label>
                  <Input
                    id="regra-valor-max"
                    value={valorMax}
                    onChange={(e) => setValorMax(e.target.value)}
                    placeholder="200,00"
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Sempre em valor absoluto, sem sinal — R$ 50,00 casa tanto uma
                saída de R$ 50 quanto uma entrada. Quem separa isso é o campo
                abaixo.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="regra-direcao">Sinal</Label>
                <select
                  id="regra-direcao"
                  className={SELECT_CLASSNAME}
                  value={direcao}
                  onChange={(e) =>
                    setDirecao(e.target.value as '' | 'expense' | 'income')
                  }
                >
                  <option value={NENHUMA}>Qualquer</option>
                  <option value="expense">Só saídas</option>
                  <option value="income">Só entradas</option>
                </select>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Então…</legend>
              <div className="space-y-1.5">
                <Label htmlFor="regra-categoria">Categoria</Label>
                <select
                  id="regra-categoria"
                  className={SELECT_CLASSNAME}
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                >
                  <option value={NENHUMA}>Não mexe</option>
                  {categoriaSumida ? (
                    <option value={categoriaId}>
                      Categoria arquivada ou removida (mantida)
                    </option>
                  ) : null}
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {categoriaSumida ? (
                  <p
                    role="alert"
                    data-testid="regra-categoria-arquivada"
                    className="text-destructive text-xs"
                  >
                    Esta regra aponta para uma categoria arquivada, e vai
                    continuar assim se você salvar. Na conferência do import a
                    sugestão dela é descartada com aviso, porque a categoria não
                    aparece em nenhuma tela — escolha outra categoria ou
                    &quot;Não mexe&quot; para a regra voltar a ter efeito.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="regra-payee">Favorecido</Label>
                <select
                  id="regra-payee"
                  className={SELECT_CLASSNAME}
                  value={payeeId}
                  onChange={(e) => setPayeeId(e.target.value)}
                >
                  <option value={NENHUMA}>Não mexe</option>
                  {payees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="regra-marca-pj"
                  className={CHECKBOX_CLASSNAME}
                  checked={marcaPj}
                  onChange={(e) => setMarcaPj(e.target.checked)}
                />
                Definir PJ/PF
              </label>
              {marcaPj ? (
                <div className="space-y-1.5">
                  <Label htmlFor="regra-valor-pj">Marcar como</Label>
                  <select
                    id="regra-valor-pj"
                    className={SELECT_CLASSNAME}
                    value={valorPj}
                    onChange={(e) => setValorPj(e.target.value as '0' | '1')}
                  >
                    <option value="1">PJ (despesa da empresa)</option>
                    <option value="0">PF (pessoal)</option>
                  </select>
                </div>
              ) : null}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="regra-prioridade">Ordem</Label>
              <Input
                id="regra-prioridade"
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Menor roda primeiro. Quando duas regras mexem no mesmo campo,
                vence a de maior número — é assim que &quot;UBER EATS&quot; vira
                Alimentação sem quebrar a regra de &quot;UBER&quot;.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="regra-ativa"
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

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando…'
                  : editandoId
                    ? 'Salvar regra'
                    : 'Criar regra'}
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
