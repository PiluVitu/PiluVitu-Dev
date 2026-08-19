import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatBRL, parseBRL, splitInstallments } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { ordenarPorHierarquia, type CategoryView } from '../lib/categories'
import { formatRange } from '../lib/commitments'
import { todayInTeresina } from '../lib/dates'
import { CHECKBOX_CLASSNAME, SELECT_CLASSNAME } from '../lib/form-classes'
import { ALVO_LINHA, ALVO_LINK } from '../lib/touch'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import type { AccountView } from './accounts'
import type { PayeeOption } from './DividasPage'
import type { RecurringExpenseView } from './recorrentes'

// Valor de "nenhuma recorrente" no <select> — mesmo truque de NENHUMA em
// pages/recorrentes.tsx: string vazia em vez de sentinel, porque o backend
// ja trata '' como "nao informado" (enviar() abaixo converte pra
// `undefined`, que JSON.stringify omite do corpo).
const NENHUMA_RECORRENTE = ''

// Mesmo sentinel de DividasPage.tsx ("— nova pessoa —"): a entidade nova é
// criada com um POST próprio ANTES do POST principal, dentro do callback de
// mutação de `mutarERecarregar`.
const NOVO_FAVORECIDO = '__novo__'

export type ModoLancar = 'lancamento' | 'transferencia'

const ABAS: { href: string; label: string; modo: ModoLancar }[] = [
  { href: '#/lancar', label: 'Lançamento', modo: 'lancamento' },
  {
    href: '#/lancar/transferir',
    label: 'Transferência',
    modo: 'transferencia',
  },
]

/**
 * As duas formas de registrar dinheiro, lado a lado dentro de `#/lancar`.
 *
 * ⚠️ **Por que a transferência mora AQUI e não numa tela própria — medido, não
 * suposto.** O `<nav>` já tem 13 destinos e foi reduzido a 5 primários + o
 * menu "Mais" (fatia D). MEDIDO em Chrome real a 390×844, com o build de
 * produção: o nav ocupa **81 px em duas linhas**, e a segunda termina em
 * `x=287` — clonar uma pílula e inserir um 6º destino primário ("Transferir")
 * mantém os mesmos **81 px** (cabe na sobra de 87 px). Ou seja: **o custo NÃO
 * é vertical.** O custo é outro, e é triplo:
 *
 * 1. Um 6º primário consome TODA a folga da segunda linha — o 7º (ou um
 *    rótulo mais longo) quebra pra uma terceira linha, +36 px em toda tela.
 * 2. A fatia D dividiu primários/secundários por FREQUÊNCIA DE USO. Uma
 *    transferência é mensal (pro-labore, aporte), não diária — promovê-la ao
 *    lado de "Lançar"/"Extrato" contradiz o critério medido.
 * 3. Jogá-la no "Mais" (14º item) custa 0 px e 2 toques — mas a esconde de
 *    quem **não sabe que a resposta é "transferência"**, que é exatamente a
 *    pessoa pra quem esta tela existe: o dono vai a `#/lancar` pra registrar
 *    o pro-labore achando que é despesa. A correção precisa estar onde ele
 *    comete o erro, não numa gaveta que só encontra quem já entendeu.
 *
 * Some-se o óbvio: os campos são quase os mesmos (valor, data, descrição,
 * categoria) e transferir É "lançar dinheiro" — só que entre duas contas.
 *
 * São `<a href>` de verdade (hash real, `#/lancar/transferir`), não estado
 * local: recarregar mantém a aba, o botão voltar do navegador funciona, e
 * `resolveRoute` já resolve qualquer `#/lancar*` pra `'lancar'` (é
 * `startsWith`), então a pílula "Lançar" do nav continua marcada — a aba não
 * custa nada ao estado ativo que a fatia D introduziu.
 *
 * `aria-current="true"` (item corrente DENTRO de um conjunto), nunca
 * `"page"`: a página corrente já é o `<a>` do nav, e dois elementos
 * anunciados como "page" mentiriam pro leitor de tela sobre onde ele está.
 */
export function AbasLancar({ ativo }: { ativo: ModoLancar }) {
  return (
    <div
      role="group"
      aria-label="Tipo de movimentação"
      data-testid="abas-lancar"
      className="flex flex-wrap gap-1"
    >
      {ABAS.map((aba) => {
        const atual = aba.modo === ativo
        return (
          <a
            key={aba.href}
            href={aba.href}
            aria-current={atual ? 'true' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              atual
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground border-input border',
            )}
          >
            {aba.label}
          </a>
        )
      })}
    </div>
  )
}

export function NewEntryPage() {
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [recorrentes, setRecorrentes] = useState<RecurringExpenseView[]>([])
  const [categorias, setCategorias] = useState<CategoryView[]>([])
  const [payees, setPayees] = useState<PayeeOption[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [payeeId, setPayeeId] = useState('')
  const [nomeFavorecidoNovo, setNomeFavorecidoNovo] = useState('')
  const [entrada, setEntrada] = useState(false)
  const [isBusiness, setIsBusiness] = useState(false)
  const [parcelado, setParcelado] = useState(false)
  const [parcelas, setParcelas] = useState(2)
  const [recorrenteId, setRecorrenteId] = useState(NENHUMA_RECORRENTE)

  const [formError, setFormError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    // GET /api/recurring devolve TODAS as recorrentes, ativas E pausadas
    // (routes/recurring.ts) — filtra `active === 1` aqui na tela Lancar
    // porque uma recorrente pausada nao pode ser vinculada (§3.1 do spec:
    // o vinculo e a prova de que o gasto aconteceu; pausada nao tem
    // projecao ativa pra suprimir).
    //
    // ⚠️ `/api/categories` vem SEM `?kind=`: o filtro segue o checkbox
    // "Entrada", e refazer a busca a cada toggle gastaria uma requisição
    // por clique pra reordenar meia dúzia de linhas que já estão na mão.
    const [contas, recs, cats, pys] = await Promise.all([
      api<AccountView[]>('/api/accounts'),
      api<RecurringExpenseView[]>('/api/recurring'),
      api<CategoryView[]>('/api/categories'),
      api<PayeeOption[]>('/api/payees'),
    ])
    if (!vivo()) return
    setAccounts(contas)
    setAccountId((atual) => atual || contas[0]?.id || '')
    setRecorrentes(recs.filter((r) => r.active === 1))
    setCategorias(cats)
    setPayees(pys)
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

  /**
   * ⚠️ O `kind` das categorias oferecidas segue o checkbox "Entrada" —
   * `income` quando marcado, `expense` quando não. Como esses são os dois
   * únicos valores que a comparação pode casar, `transfer` e
   * `debt_settlement` ficam SEMPRE de fora, e isso é o ponto: são as duas
   * classes que todo relatório de resultado exclui. Deixar o dono escolher
   * "Quitação de dívida" à mão recriaria exatamente a dupla contagem que o
   * slug dedicado de `payDebt()` existe pra impedir.
   */
  const categoriasVisiveis = useMemo(() => {
    const desejado = entrada ? 'income' : 'expense'
    return ordenarPorHierarquia(categorias.filter((c) => c.kind === desejado))
  }, [categorias, entrada])

  // Trocar o "Entrada" troca a lista inteira — a categoria escolhida antes
  // pode não existir mais nela. Sem limpar, o `<select>` renderiza vazio (o
  // valor não casa com nenhuma <option>) mas o ESTADO segue com o id velho,
  // e o lançamento sairia com uma categoria do tipo errado, em silêncio.
  useEffect(() => {
    if (!categoryId) return
    if (
      !categoriasVisiveis.some(({ categoria }) => categoria.id === categoryId)
    )
      setCategoryId('')
  }, [categoriasVisiveis, categoryId])

  const totalCents = useMemo(() => {
    if (valor.trim() === '') return 0
    try {
      return parseBRL(valor)
    } catch {
      return -1
    }
  }, [valor])

  const previa = useMemo(() => {
    if (!parcelado || totalCents <= 0 || parcelas < 1) return null
    return splitInstallments(totalCents, parcelas)
  }, [parcelado, totalCents, parcelas])

  if (loadError) return <p role="alert">{loadError}</p>

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setOkMsg(null)

    if (totalCents <= 0) {
      setFormError('Valor inválido. Use o formato 1.360,00.')
      return
    }
    if (descricao.trim() === '') {
      setFormError('Descreva o lançamento.')
      return
    }
    if (!accountId) {
      setFormError('Escolha a conta.')
      return
    }
    if (payeeId === NOVO_FAVORECIDO && nomeFavorecidoNovo.trim() === '') {
      setFormError('Informe o nome do favorecido.')
      return
    }

    const purchase_date = data || todayInTeresina()
    const is_business = isBusiness ? 1 : 0
    const criandoFavorecido = payeeId === NOVO_FAVORECIDO

    setEnviando(true)
    // Mutação e recarga em `try` separados (lib/mutar-e-recarregar.ts): a
    // recarga existe pra o favorecido recém-criado aparecer no <select> da
    // próxima vez, e um GET que cai depois de um 201 NUNCA pode ler como
    // "o lançamento falhou" — o dono reenviaria e duplicaria dinheiro.
    const resultado = await mutarERecarregar(
      async () => {
        let idFavorecido = criandoFavorecido ? '' : payeeId
        if (criandoFavorecido) {
          // ⚠️ `default_category_id` vai junto: `POST /api/payees` sempre
          // aceitou o campo e NINGUÉM nunca o enviava — é por isso que a
          // sugestão do import (`payee-suggest.ts` → `importar.tsx`) sempre
          // vinha sem categoria. Criar o favorecido aqui, já com a categoria
          // escolhida, é o primeiro escritor real desse campo.
          const criado = await api<PayeeOption>('/api/payees', {
            method: 'POST',
            body: JSON.stringify({
              name: nomeFavorecidoNovo.trim(),
              kind: 'merchant',
              default_category_id: categoryId || undefined,
            }),
          })
          idFavorecido = criado.id
        }

        // '' vira undefined, que JSON.stringify OMITE do corpo — nunca uma
        // string vazia (mesma disciplina de `recurring_expense_id`: quem
        // decide no backend é a AUSÊNCIA da chave).
        const vinculos = {
          category_id: categoryId || undefined,
          payee_id: idFavorecido || undefined,
        }

        if (parcelado) {
          // ⚠️ Os dois campos vão TAMBÉM no ramo parcelado — o backend já os
          // lê (routes/installments.ts) e os propaga pra CADA parcela
          // (createInstallmentPlan). Diferente do select "Recorrente", que é
          // escondido de propósito quando "Parcelado" está marcado.
          await api('/api/installment-plans', {
            method: 'POST',
            body: JSON.stringify({
              account_id: accountId,
              description: descricao,
              total_cents: totalCents,
              installments_count: parcelas,
              purchase_date,
              is_business,
              ...vinculos,
            }),
          })
          setOkMsg(`Plano de ${parcelas}× criado.`)
        } else {
          await api('/api/transactions', {
            method: 'POST',
            body: JSON.stringify({
              account_id: accountId,
              amount_cents: entrada ? totalCents : -totalCents,
              purchase_date,
              description: descricao,
              is_business,
              // §3.1 do spec: sem vinculo explicito, a projecao da recorrente
              // continua aparecendo — e isso e decidido pela AUSENCIA da
              // chave, nao por um valor vazio.
              recurring_expense_id: recorrenteId || undefined,
              ...vinculos,
            }),
          })
          setOkMsg('Lançamento gravado.')
        }
        setDescricao('')
        setValor('')
        setRecorrenteId(NENHUMA_RECORRENTE)
        setNomeFavorecidoNovo('')
        if (criandoFavorecido) setPayeeId('')
      },
      carregar,
      `${parcelado ? `O plano de ${parcelas}× "${descricao}"` : `O lançamento "${descricao}"`} foi gravado, mas não consegui recarregar as listas — atualize a página. Não envie de novo: criaria um lançamento duplicado${criandoFavorecido ? ` e um segundo favorecido "${nomeFavorecidoNovo.trim()}"` : ''}.`,
    )
    if (!resultado.ok) {
      setFormError(resultado.mensagem)
      if (resultado.fase === 'mutacao') setOkMsg(null)
    }
    setEnviando(false)
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Lançar</h1>
      <AbasLancar ativo="lancamento" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo lançamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-lancamento"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="lancamento-descricao">Descrição</Label>
              <Input
                id="lancamento-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lancamento-valor">Valor</Label>
              <Input
                id="lancamento-valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="1.360,00"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="lancamento-data">Data</Label>
                <Ajuda rotulo="Competência">
                  O mês em que a fatura fecha, não o da compra. Compra em 28/07
                  num cartão que fecha dia 25 cai na competência de agosto.
                </Ajuda>
              </div>
              <Input
                id="lancamento-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lancamento-conta">Conta</Label>
              <select
                id="lancamento-conta"
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

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="lancamento-categoria">Categoria</Label>
                <Ajuda rotulo="Categoria">
                  A lista muda com o checkbox "Entrada": marcado mostra as
                  categorias de entrada, desmarcado as de despesa. Transferência
                  entre contas e quitação de dívida nunca aparecem — todo
                  relatório de resultado exclui as duas, e escolhê-las à mão
                  contaria o mesmo dinheiro duas vezes. Filhas aparecem
                  indentadas sob a mãe.
                </Ajuda>
              </div>
              <select
                id="lancamento-categoria"
                className={SELECT_CLASSNAME}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— sem categoria —</option>
                {categoriasVisiveis.map(({ categoria, nivel }) => (
                  <option key={categoria.id} value={categoria.id}>
                    {/* Espaco NAO-QUEBRAVEL (\u00a0), nunca espaco comum: o
                        navegador colapsa/apara espaco comum no rotulo de um
                        <option>, e a indentacao — a unica forma de mostrar
                        hierarquia dentro de um <select> nativo — sumiria. */}
                    {nivel === 1
                      ? `\u00a0\u00a0↳ ${categoria.name}`
                      : categoria.name}
                  </option>
                ))}
              </select>
              <a
                href="#/categorias"
                className={cn(
                  'text-muted-foreground text-xs underline underline-offset-4',
                  ALVO_LINK,
                )}
              >
                Criar ou editar categorias
              </a>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lancamento-favorecido">Favorecido</Label>
              <select
                id="lancamento-favorecido"
                className={SELECT_CLASSNAME}
                value={payeeId}
                onChange={(e) => setPayeeId(e.target.value)}
              >
                <option value="">— sem favorecido —</option>
                <option value={NOVO_FAVORECIDO}>— novo favorecido —</option>
                {payees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {payeeId === NOVO_FAVORECIDO ? (
              <div className="space-y-1.5">
                <Label htmlFor="lancamento-favorecido-novo">
                  Nome do favorecido
                </Label>
                <Input
                  id="lancamento-favorecido-novo"
                  value={nomeFavorecidoNovo}
                  onChange={(e) => setNomeFavorecidoNovo(e.target.value)}
                  placeholder="Mercado São Luiz"
                />
                <p className="text-muted-foreground text-xs">
                  A categoria escolhida acima vira a categoria padrão dele — é
                  ela que o import vai sugerir da próxima vez que esse nome
                  aparecer na fatura.
                </p>
              </div>
            ) : null}

            {!parcelado ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="lancamento-recorrente">Recorrente</Label>
                  <Ajuda rotulo="Recorrente">
                    Marque quando este lançamento FOR uma despesa recorrente já
                    cadastrada — ex.: "este é o Starlink de agosto". Isso evita
                    que o Comprometido conte o mesmo gasto duas vezes (a
                    projeção e o lançamento real). Só recorrentes ativas
                    aparecem aqui; uma pausada não pode ser vinculada.
                  </Ajuda>
                </div>
                <select
                  id="lancamento-recorrente"
                  className={SELECT_CLASSNAME}
                  value={recorrenteId}
                  onChange={(e) => setRecorrenteId(e.target.value)}
                >
                  <option value={NENHUMA_RECORRENTE}>— nenhuma —</option>
                  {recorrentes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.description} —{' '}
                      {formatRange({
                        min: r.amount_min_cents,
                        max: r.amount_max_cents,
                      })}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className={cn(ALVO_LINHA, 'gap-2 text-sm')}>
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASSNAME}
                  checked={entrada}
                  onChange={(e) => setEntrada(e.target.checked)}
                />
                Entrada
              </label>

              <div className="flex items-center gap-2">
                <label className={cn(ALVO_LINHA, 'gap-2 text-sm')}>
                  <input
                    type="checkbox"
                    className={CHECKBOX_CLASSNAME}
                    checked={isBusiness}
                    onChange={(e) => setIsBusiness(e.target.checked)}
                  />
                  PJ
                </label>
                <Ajuda rotulo="PJ / PF">
                  scope é o padrão da conta; is_business é a verdade do
                  lançamento — dá para pagar algo PF pelo cartão PJ.
                </Ajuda>
              </div>

              <label className={cn(ALVO_LINHA, 'gap-2 text-sm')}>
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASSNAME}
                  checked={parcelado}
                  onChange={(e) => setParcelado(e.target.checked)}
                />
                Parcelado
              </label>
            </div>

            {parcelado ? (
              <div className="space-y-1.5">
                <Label htmlFor="lancamento-parcelas">Parcelas</Label>
                <Input
                  id="lancamento-parcelas"
                  type="number"
                  min={1}
                  max={360}
                  value={parcelas}
                  onChange={(e) => setParcelas(Number(e.target.value))}
                />
                {previa ? (
                  <p
                    data-testid="previa-parcelas"
                    className="text-muted-foreground text-sm"
                  >
                    {parcelas}× de{' '}
                    {previa
                      .slice(0, 3)
                      .map((c) => formatBRL(c))
                      .join(' / ')}
                    {previa.length > 3 ? ' …' : ''}
                  </p>
                ) : null}
              </div>
            ) : null}

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            {okMsg ? (
              <p role="status" className="text-success text-sm">
                {okMsg}
              </p>
            ) : null}
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Gravar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
