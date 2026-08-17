import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { ordenarPorHierarquia, type CategoryView } from '../lib/categories'
import { isRealCalendarDate, todayInTeresina } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import type { AccountView } from './accounts'
import { AbasLancar } from './new-entry'

/**
 * A tela que faltava: `POST /api/transfers` existe, é testada, e tinha **0
 * consumidores** em `web/src` — o backend inteiro (duas pernas num único
 * `db.batch()`, mesmo `transfer_id`, `settled_at` já preenchido,
 * `bill_competence` NULL) estava pronto e inalcançável por qualquer clique.
 *
 * ⚠️ **A urgência é dupla contagem acontecendo AGORA, por ausência de
 * interface.** Sem esta tela, registrar uma transferência exige dois
 * lançamentos soltos — e aí `#/fluxo` conta uma despesa real E uma receita
 * real, inflando os dois lados. `transfer_id` existe exatamente pra impedir
 * isso, e estava sendo contornado por não ter onde ser criado.
 *
 * Onde ela mora (aba dentro de `#/lancar`, não tela própria) e por quê: ver
 * `AbasLancar` em `./new-entry` — a decisão foi medida em Chrome real, não
 * argumentada.
 */

/**
 * ⚠️ **O filtro de categoria aqui é o OPOSTO do de `#/lancar` — mas NÃO é o
 * espelho invertido dele, e essa diferença é a decisão.**
 *
 * Lá (`new-entry.tsx`, `categoriasVisiveis`) a lista segue o checkbox
 * "Entrada" (`income` × `expense`), o que deixa `transfer` e
 * `debt_settlement` SEMPRE de fora — porque são as duas classes que todo
 * relatório de resultado exclui, e escolhê-las num gasto recriaria a dupla
 * contagem que o slug dedicado de `payDebt()` existe pra impedir. Esse filtro
 * está CERTO e não é afrouxado por esta tela.
 *
 * Aqui, `transfer` é justamente o que faz sentido — é o `kind` de
 * "Pro-labore". Mas a lista NÃO é "só `transfer`", e o motivo é o mesmo que
 * levou `createTransfer` (Worker, `src/domain/transactions.ts`) a **não**
 * exigir `kind = 'transfer'`: a tela de categorias só cria `expense`/`income`
 * (as duas classes estruturais ficam de fora de propósito), então exigir
 * `transfer` prenderia o dono pra sempre nas DUAS linhas semeadas
 * (`Pro-labore`, `Transferencia entre contas`) — um "Aporte" novo exigiria
 * SQL manual. Oferecer menos do que o servidor aceita seria recusar o útil
 * pra impedir o inofensivo.
 *
 * O único excluído é `debt_settlement`: ele tem DONO — `payDebt()` acha a
 * categoria por `slug='quitacao-divida'`, e quitar dívida tem tela própria
 * (`#/dividas/:id`). Uma perna de transferência marcada como "Quitação de
 * dívida" é inerte no banco (todo relatório filtra `transfer_id IS NULL`),
 * mas seria uma mentira sobre um mecanismo que o app opera sozinho — e a
 * regra desta base é não OFERECER o que não faz sentido, mesmo quando o
 * servidor toleraria.
 */
function categoriaOferecivel(c: CategoryView): boolean {
  return c.kind !== 'debt_settlement'
}

export function TransferirPage() {
  const [contas, setContas] = useState<AccountView[]>([])
  /**
   * ⚠️ Cartão de crédito FORA dos dois selects, e isso é conserto de defeito
   * MEDIDO, não simetria estética. Transferir R$ 180 da PJ pro cartão deixa o
   * app dizendo duas coisas opostas sobre a MESMA obrigação: `accountBalances`
   * leva o cartão de -18000 pra 0 (a tela Contas passa a dizer **pago**),
   * enquanto `commitments()` continua devolvendo `{min:18000,max:18000}` (o
   * Comprometido continua dizendo **devendo**). Nenhum dos dois está errado
   * isoladamente — o modelo é que não fecha: pagar fatura de cartão não é
   * mover dinheiro entre contas, é liquidar as linhas daquela competência, e
   * isso não tem tela (é a entidade Bill que o roadmap registra como ausente).
   *
   * O precedente é do próprio app: `pages/debt-detail.tsx:158` esconde cartão
   * do select de conta de pagamento pelo mesmo motivo — não oferecer o que o
   * modelo não sabe fechar. Aqui o servidor nem recusa, o que é pior: ele
   * aceita e o app fica incoerente consigo mesmo, em silêncio.
   */
  const contasTransferiveis = useMemo(
    () => contas.filter((c) => c.kind !== 'credit_card'),
    [contas],
  )
  const [categorias, setCategorias] = useState<CategoryView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [origemId, setOrigemId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [valor, setValor] = useState('')
  // ⚠️ `todayInTeresina()`, NUNCA `new Date().toISOString().slice(0,10)`: às
  // 22h de Teresina o UTC já virou o dia seguinte, e a transferência nasceria
  // com a data de amanhã. Mesmo bug de fuso que este módulo já pagou várias
  // vezes — e aqui ele contaminaria também `settled_at`, que `createTransfer`
  // preenche com esta MESMA data (transferência não é promessa, já nasce
  // liquidada) e que decide em qual mês ela entra no fluxo de caixa.
  const [data, setData] = useState(() => todayInTeresina())
  const [descricao, setDescricao] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const [formError, setFormError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    // `/api/categories` vem SEM `?kind=` — o filtro é no cliente (ver
    // `categoriaOferecivel` acima), sobre meia dúzia de linhas que já estão
    // na mão. Contas entram na recarga pós-envio porque os DOIS saldos
    // mudam: é a confirmação visível de que a transferência valeu.
    const [cs, cats] = await Promise.all([
      api<AccountView[]>('/api/accounts'),
      api<CategoryView[]>('/api/categories'),
    ])
    if (!vivo()) return
    setContas(cs)
    setCategorias(cats)
    setOrigemId((atual) => atual || cs[0]?.id || '')
    setDestinoId((atual) => atual || cs[1]?.id || '')
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

  const categoriasVisiveis = useMemo(
    () => ordenarPorHierarquia(categorias.filter(categoriaOferecivel)),
    [categorias],
  )

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setOkMsg(null)

    // Validações no CLIENTE, antes de gastar requisição. As três primeiras
    // são exatamente as que `createTransfer` recusaria (contas iguais, valor
    // não-positivo) ou que o `CHECK` do schema barraria — dizê-las aqui
    // troca um round-trip e uma mensagem de servidor por uma frase que
    // explica o que fazer.
    if (!origemId || !destinoId) {
      setFormError('Escolha a conta de origem e a de destino.')
      return
    }
    if (origemId === destinoId) {
      setFormError(
        'Origem e destino precisam ser contas diferentes — uma transferência move dinheiro de uma conta para outra.',
      )
      return
    }

    let cents: number
    try {
      cents = parseBRL(valor)
    } catch {
      setFormError('Valor inválido. Use o formato 1.360,00.')
      return
    }
    if (cents <= 0) {
      setFormError(
        'O valor precisa ser maior que zero. O sinal não se digita aqui: quem sai é a conta de origem, quem entra é a de destino.',
      )
      return
    }

    if (!isRealCalendarDate(data)) {
      setFormError('Data inválida. Informe um dia que exista no calendário.')
      return
    }

    if (descricao.trim() === '') {
      setFormError('Descreva a transferência (ex.: "Pro-labore de agosto").')
      return
    }

    const valorFormatado = formatBRL(cents)
    const nomeOrigem = contas.find((c) => c.id === origemId)?.name ?? 'origem'
    const nomeDestino =
      contas.find((c) => c.id === destinoId)?.name ?? 'destino'

    setEnviando(true)
    // Mutação e recarga em `try` SEPARADOS (`lib/mutar-e-recarregar.ts`, 9º
    // call site). Aqui a regra vale mais do que em qualquer outra tela: um
    // POST 2xx seguido de um GET que cai (rede instável no Android) faria a
    // tela dizer "falhou" para uma transferência que aconteceu — e o reenvio
    // não é inofensivo, é dinheiro contado a mais. Por isso a mensagem de
    // recarga NOMEIA o estrago em vez de pedir genericamente pra não repetir.
    const resultado = await mutarERecarregar(
      async () => {
        await api('/api/transfers', {
          method: 'POST',
          body: JSON.stringify({
            from_account_id: origemId,
            to_account_id: destinoId,
            amount_cents: cents,
            date: data,
            description: descricao.trim(),
            // '' vira undefined, e `JSON.stringify` OMITE a chave — nunca uma
            // string vazia. Quem decide no backend é a AUSÊNCIA (mesma
            // disciplina de `category_id`/`recurring_expense_id` em
            // `new-entry.tsx`); uma string vazia bateria na FK de
            // `categories(id)` e viraria 422 por um campo OPCIONAL.
            category_id: categoryId || undefined,
          }),
        })
        setOkMsg(
          `Transferência de ${valorFormatado} registrada: saiu de ${nomeOrigem}, entrou em ${nomeDestino}.`,
        )
        setValor('')
        setDescricao('')
      },
      carregar,
      `A transferência de ${valorFormatado} (${nomeOrigem} → ${nomeDestino}) FOI registrada, mas não consegui recarregar os saldos — atualize a página pra vê-los. Não envie de novo: criaria uma SEGUNDA transferência, e o mesmo dinheiro apareceria saindo duas vezes de ${nomeOrigem} e entrando duas vezes em ${nomeDestino}.`,
    )
    if (!resultado.ok) {
      setFormError(resultado.mensagem)
      if (resultado.fase === 'mutacao') setOkMsg(null)
    }
    setEnviando(false)
  }

  if (loadError) return <p role="alert">{loadError}</p>

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Lançar</h1>
      <AbasLancar ativo="transferencia" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Transferência entre contas
            <Ajuda rotulo="Transferência">
              <p>
                Transferência é dinheiro <strong>seu</strong> que muda de conta.
                Não é gasto: o total continua o mesmo, só mudou de lugar.
              </p>
              <p className="mt-2">
                É por isso que{' '}
                <strong>pro-labore é transferência, não despesa</strong>. O
                dinheiro sai da conta da PJ e entra na sua conta PF — ele não
                saiu do seu bolso. Lançado como despesa, ele sairia da PJ{' '}
                <strong>sem entrar</strong> na PF, e o saldo total ficaria menor
                do que é de verdade.
              </p>
              <p className="mt-2">
                Por isso são gravadas duas linhas de uma vez (a saída e a
                entrada), com o mesmo identificador: o fluxo de caixa e os
                relatórios ignoram as duas, senão o mesmo dinheiro seria contado
                como despesa <em>e</em> como receita.
              </p>
            </Ajuda>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-transferencia"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="transferencia-origem">De (sai desta conta)</Label>
              <select
                id="transferencia-origem"
                className={SELECT_CLASSNAME}
                value={origemId}
                onChange={(e) => setOrigemId(e.target.value)}
              >
                {contasTransferiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transferencia-destino">
                Para (entra nesta conta)
              </Label>
              <select
                id="transferencia-destino"
                className={SELECT_CLASSNAME}
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
              >
                {contasTransferiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transferencia-valor">Valor</Label>
              <Input
                id="transferencia-valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="4.300,00"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transferencia-data">Data</Label>
              <Input
                id="transferencia-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transferencia-descricao">Descrição</Label>
              <Input
                id="transferencia-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Pro-labore de agosto"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="transferencia-categoria">
                  Categoria (opcional)
                </Label>
                <Ajuda rotulo="Categoria da transferência">
                  <p>
                    Aqui a lista é o <strong>oposto</strong> da aba Lançamento:
                    lá "Pro-labore" e "Transferência entre contas" nunca
                    aparecem — são as classes que todo relatório de resultado
                    exclui, e escolhê-las num gasto contaria o mesmo dinheiro
                    duas vezes. Aqui elas são justamente o que faz sentido.
                  </p>
                  <p className="mt-2">
                    Categorias de despesa e de receita continuam na lista porque
                    a tela de categorias só cria essas duas — sem elas, um
                    "Aporte" novo seria impossível sem mexer no banco. Só
                    "Quitação de dívida" fica de fora: pagar dívida tem tela
                    própria.
                  </p>
                  {/*
                    ⚠️ A versão anterior deste texto dizia que a categoria
                    "responde 'quanto tirei de pro-labore este ano?'". É FALSO
                    hoje, e foi medido: 12 transferências categorizadas
                    (R$ 51.600 no banco) e `byCategory('2026-08')` devolve
                    `rows: []`, `total_cents: 0` — porque os três relatórios
                    agregados (`cashflow`, `commitments`, `byCategory`) filtram
                    `transfer_id IS NULL`, e isso está CERTO (é o que impede a
                    dupla contagem). O dado é gravado e é o certo; falta
                    consumidor. Prometer o relatório que não existe faria o
                    dono confiar num número que ele nunca vai ver.
                  */}
                  <p className="mt-2">
                    A categoria é gravada na perna de <strong>saída</strong>, e
                    hoje ela serve pra você <strong>achar</strong> a
                    transferência no Extrato — pelo nome ou pela busca.
                  </p>
                  <p className="mt-2">
                    ⚠️ Ela ainda <strong>não</strong> aparece em relatório:
                    Comprometido, Fluxo de caixa e "para onde foi o dinheiro"
                    excluem transferência de propósito, senão o mesmo dinheiro
                    seria contado duas vezes. Um total de "quanto tirei de
                    pro-labore no ano" é tela que ainda não existe.
                  </p>
                </Ajuda>
              </div>
              <select
                id="transferencia-categoria"
                className={SELECT_CLASSNAME}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— sem categoria —</option>
                {categoriasVisiveis.map(({ categoria, nivel }) => (
                  <option key={categoria.id} value={categoria.id}>
                    {/* Espaço NÃO-QUEBRÁVEL ( ), nunca espaço comum — o
                        navegador colapsa/apara espaço comum no rótulo de uma
                        <option>, e a indentação (a única forma de mostrar
                        hierarquia num <select> nativo) sumiria. Mesma lição
                        já medida em `new-entry.tsx`. */}
                    {nivel === 1
                      ? `\u00a0\u00a0↳ ${categoria.name}`
                      : categoria.name}
                  </option>
                ))}
              </select>
            </div>

            {formError ? (
              <p
                role="alert"
                data-testid="transferencia-erro"
                className="text-destructive text-sm"
                // ⚠️ `block: 'nearest'` — a lição já paga em `#/extrato`: uma
                // recusa que renderiza fora do viewport não existe pro dono.
                // MEDIDO lá no Chrome real a 390×844: a mensagem nascia
                // 3.828 px acima da vista e o botão "parecia não fazer nada".
                // Aqui o alerta nasce logo acima do botão, mas o botão fica no
                // fim de um formulário de seis campos — na zona do polegar,
                // com o teclado virtual aberto, ele pode estar na borda de
                // baixo e o alerta abaixo dela. `'nearest'` rola o MÍNIMO e é
                // no-op quando já está visível: nunca tira o dono do lugar
                // onde ele estava (o motivo de `'center'`/`'start'` terem sido
                // descartados lá).
                ref={(el) => {
                  el?.scrollIntoView({ block: 'nearest' })
                }}
              >
                {formError}
              </p>
            ) : null}
            {okMsg ? (
              <p
                role="status"
                data-testid="transferencia-ok"
                className="text-success text-sm"
              >
                {okMsg}
              </p>
            ) : null}

            <Button type="submit" disabled={enviando}>
              {enviando ? 'Transferindo…' : 'Transferir'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
