import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@piluvitu/ui/sheet'
import { api, ApiError } from '../api'
import { rotuloCompetencia } from '../lib/commitments'
import { rotuloConta } from '../lib/contas'
import { isRealCalendarDate, todayInTeresina } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import { ROTULO } from '../lib/tipografia'
import { ALVO_LINHA, ALVO_LINK } from '../lib/touch'
import type { AccountView } from '../pages/accounts'
import { NumeroCard } from './NumeroCard'

/**
 * ⚠️ ONDE ESTA TELA MORA, e por quê: um `Sheet` a partir da LINHA DO CARTÃO
 * em `#/contas` — zero destino novo no `<nav>`, zero rota nova.
 *
 * Os três candidatos foram pesados, não sorteados:
 *
 * 1. **Tela própria `#/faturas`** — seria o 15º destino. O `<nav>` já foi
 *    reduzido a 5 primários + "Mais" justamente porque 14 destinos não cabem
 *    (fatia D, com a medição em `pages/transferir.tsx`: um 6º primário come
 *    TODA a folga da 2ª linha). Pagar fatura é MENSAL — pelo critério de
 *    frequência que dividiu primários de secundários, ela nunca seria
 *    primária; e no "Mais" seria um 15º item que só encontra quem já sabe que
 *    a resposta se chama "fatura".
 * 2. **`Sheet` a partir de `#/comprometido`** — é lá que a fatura aparece
 *    como compromisso, mas aquela tela responde OUTRA pergunta: ela mostra
 *    FAIXAS (min/max) de 6 meses, misturando parcela prevista com recorrente
 *    em faixa. O número de lá não é o valor pagável desta fatura, e a tela
 *    não carrega `balance_cents` de conta nenhuma — o saldo da origem, que é
 *    requisito, exigiria um segundo fetch só pra isso.
 * 3. **`#/contas`, escolhida.** É onde o cartão mora e onde o saldo NEGATIVO
 *    dele está à vista — exatamente o número que este pagamento zera. E o
 *    `GET /api/accounts` que a página já faz traz `kind`, `closing_day` e
 *    `balance_cents` de TODAS as contas: a origem do dinheiro e o saldo dela
 *    (requisito, e achado da revisão de `transferir.tsx`: escolher origem sem
 *    ver saldo é decidir às cegas) já estão em memória, sem uma requisição a
 *    mais. O painel só pede o que a página não tem: as faturas em aberto.
 *
 * `@piluvitu/ui/sheet` custa **0 kB a mais** — é o mesmo
 * `@radix-ui/react-dialog` que o `Dialog` de confirmação de `accounts.tsx` já
 * traz (precedente medido no painel de filtros de `#/extrato`).
 */

/** Shape de `GET /api/bills` (Worker: `listOpenBills`). */
export type OpenBillView = {
  competence: string
  amount_cents: number
  line_count: number
}

export type PagarFaturaProps = {
  /** A conta `credit_card` cuja fatura está sendo paga. */
  cartao: AccountView
  /** Todas as contas — a origem sai daqui, já com `balance_cents`. */
  contas: AccountView[]
  /** Recarga da lista de contas do pai: os DOIS saldos mudam. */
  recarregarContas: () => Promise<unknown>
}

export function PagarFatura({
  cartao,
  contas,
  recarregarContas,
}: PagarFaturaProps) {
  const [aberto, setAberto] = useState(false)
  const [faturas, setFaturas] = useState<OpenBillView[] | null>(null)
  const [competencia, setCompetencia] = useState('')
  const [origemId, setOrigemId] = useState('')
  const [pagoEm, setPagoEm] = useState(todayInTeresina)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  /**
   * ⚠️ Trava o botão depois que o dinheiro JÁ SE MOVEU e só a recarga falhou.
   * Sem isto, a tela fica mostrando o painel com o botão ativo ao lado de uma
   * mensagem dizendo "não reenvie" — e o segundo toque pagaria a fatura duas
   * vezes. A mensagem avisa; isto impede.
   */
  const [pago, setPago] = useState(false)

  const buscar = useCallback(
    () =>
      api<OpenBillView[]>(
        `/api/bills?card_account_id=${encodeURIComponent(cartao.id)}`,
      ),
    [cartao.id],
  )

  // Abrir o painel é o que dispara a leitura: a lista de contas tem N cartões
  // e buscar a fatura de todos no mount cobraria N requisições por uma tela
  // que o dono abre uma vez por mês.
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    setFaturas(null)
    setErro(null)
    setPago(false)
    // A data volta pro default a cada abertura: um painel reaberto no dia
    // seguinte não pode oferecer a data de ontem já preenchida.
    setPagoEm(todayInTeresina())
    buscar()
      .then((dados) => {
        if (!vivo) return
        setFaturas(dados)
        setCompetencia(dados[0]?.competence ?? '')
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [aberto, buscar])

  const recarregarFaturas = useCallback(async () => {
    const dados = await buscar()
    setFaturas(dados)
    setCompetencia((atual) =>
      dados.some((f) => f.competence === atual)
        ? atual
        : (dados[0]?.competence ?? ''),
    )
  }, [buscar])

  const fatura = faturas?.find((f) => f.competence === competencia) ?? null

  /**
   * ⚠️ Cartão FORA da origem, pela mesma razão de `pages/transferir.tsx`: o
   * dinheiro da fatura sai de conta corrente/poupança/dinheiro. Pagar cartão
   * COM cartão não é uma operação que este modelo saiba fechar — e o próprio
   * `payBill` recusa (`invalid_account`) quando a origem é o próprio cartão.
   */
  const origens = useMemo(
    () => contas.filter((c) => c.kind !== 'credit_card'),
    [contas],
  )
  const origem = origens.find((c) => c.id === origemId) ?? null

  // Aviso, NUNCA bloqueio: gastar mais do que a conta tem é decisão do dono
  // (o servidor aceita e o saldo fica negativo), mas ele precisa ver antes.
  const saldoNaoCobre =
    origem !== null &&
    fatura !== null &&
    origem.balance_cents < fatura.amount_cents

  function revisar() {
    setErro(null)
    if (fatura === null) {
      setErro('Não há fatura em aberto neste cartão.')
      return
    }
    if (origem === null) {
      setErro('Escolha a conta de onde o dinheiro sai.')
      return
    }
    // Um `<input type="date">` não produz data inexistente sozinho, mas
    // produz string VAZIA (campo limpo, preenchimento parcial no Android).
    if (!isRealCalendarDate(pagoEm)) {
      setErro('Informe a data do pagamento (dia, mês e ano válidos).')
      return
    }
    setConfirmando(true)
  }

  /**
   * ⚠️⚠️ O DIÁLOGO SÓ FECHA DEPOIS DO `await` — e isso é conserto de um defeito
   * MEDIDO em Chrome real a 390×844 com toque de verdade (`page.tap`), que
   * NENHUM teste em jsdom reproduz.
   *
   * A versão anterior fazia `setConfirmando(false)` como primeira linha, ainda
   * DENTRO do handler do toque. O React 19 aplicava a mudança na hora, o
   * diálogo (a camada de cima) desmontava no MEIO do gesto, e o resto da mesma
   * sequência de eventos (o `click` que vem depois do `pointerup`) caía no
   * overlay do `Sheet` que estava atrás — **fechando o painel inteiro**.
   * Resultado medido: o `POST` saía, voltava `422`, e o dono via o painel
   * simplesmente sumir, sem erro nenhum na tela. Exatamente o modo de falha
   * que a regra "a recusa do servidor tem que ficar VISÍVEL" existe pra
   * impedir — e o pior possível, porque a fatura pode ou não ter sido paga e a
   * tela não diz nada.
   *
   * jsdom não faz hit testing nem sequência real de ponteiro, então os testes
   * passavam com o defeito de pé; só o navegador acusou.
   *
   * Fechando depois do `await`, o desmonte acontece numa tarefa posterior — o
   * gesto já terminou, não há evento sobrando pra vazar pra camada de baixo. E
   * de brinde o diálogo passa a mostrar "Pagando…" na camada que o dono está
   * olhando, em vez de sumir e deixá-lo sem retorno nenhum durante a espera.
   */
  async function pagar() {
    if (fatura === null || origem === null) return
    setEnviando(true)
    setErro(null)

    const quanto = formatBRL(fatura.amount_cents)
    const quando = rotuloCompetencia(fatura.competence)

    // ⚠️ Mutação e recarga em `try` SEPARADOS (`lib/mutar-e-recarregar.ts`,
    // 10º call site). Aqui a regra vale mais do que em qualquer outra tela do
    // app: um POST 201 seguido de um GET que cai faria a tela dizer "falhou"
    // para um pagamento que ACONTECEU — e o reenvio não é inofensivo, é a
    // fatura paga DUAS vezes (segunda transferência, dinheiro saindo de novo).
    const resultado = await mutarERecarregar(
      () =>
        api('/api/bills/pay', {
          method: 'POST',
          body: JSON.stringify({
            card_account_id: cartao.id,
            competence: fatura.competence,
            from_account_id: origem.id,
            paid_on: pagoEm,
            // ⚠️ CONFIRMAÇÃO, não valor parcial: se uma compra for importada
            // entre a renderização e este toque, o total muda sem o dono ver
            // e o servidor recusa (`amount_mismatch`) em vez de pagar outro
            // número. É o motivo de `payBill` aceitar este campo.
            expected_amount_cents: fatura.amount_cents,
          }),
        }),
      async () => {
        await recarregarFaturas()
        await recarregarContas()
      },
      `A fatura de ${quando} FOI PAGA: ${fatura.line_count} ${fatura.line_count === 1 ? 'lançamento foi liquidado' : 'lançamentos foram liquidados'} e ${quanto} saíram de "${origem.name}". Não consegui recarregar a tela — atualize a página pra ver os saldos novos. ⚠️ NÃO toque em pagar de novo: isso pagaria a fatura duas vezes, criando uma segunda transferência e tirando ${quanto} de "${origem.name}" outra vez.`,
    )

    setEnviando(false)
    // ⚠️ DEPOIS do await — ver o bloco acima. Nunca mover pra antes.
    setConfirmando(false)
    if (resultado.ok) {
      setAberto(false)
      return
    }
    // Só a recarga falhou => o dinheiro se moveu. Trava o botão.
    if (resultado.fase === 'recarga') setPago(true)
    setErro(resultado.mensagem)
  }

  return (
    <>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="link"
            size="sm"
            className={cn('h-auto p-0 text-xs no-underline', ALVO_LINK)}
            aria-label={`Pagar fatura do cartão ${cartao.name}`}
            data-testid={`pagar-fatura-${cartao.id}`}
          >
            pagar fatura
          </Button>
        </SheetTrigger>

        <SheetContent
          side="bottom"
          className="max-h-[85vh] space-y-4 overflow-y-auto"
          data-testid="painel-pagar-fatura"
        >
          <SheetHeader>
            <SheetTitle>Pagar fatura · {cartao.name}</SheetTitle>
            <SheetDescription>
              Tira o dinheiro da conta escolhida e dá baixa em todos os
              lançamentos daquela competência, de uma vez.
            </SheetDescription>
          </SheetHeader>

          {faturas === null && erro === null ? <p>Carregando…</p> : null}

          {faturas !== null && faturas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma fatura em aberto neste cartão. Compras já liquidadas não
              aparecem aqui, e uma competência que fecha em crédito (estorno
              maior que as compras) também não — não há o que pagar.
            </p>
          ) : null}

          {faturas !== null && faturas.length > 0 ? (
            <div className="space-y-4">
              {/*
                O seletor só existe quando há mais de uma competência aberta —
                um `<select>` de opção única é um alvo de toque que não faz
                nada. Com uma só, a competência aparece no rótulo do número.
              */}
              {faturas.length > 1 ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`fatura-competencia-${cartao.id}`}>
                    Competência
                  </Label>
                  <select
                    id={`fatura-competencia-${cartao.id}`}
                    className={SELECT_CLASSNAME}
                    data-testid="fatura-competencia"
                    value={competencia}
                    onChange={(e) => setCompetencia(e.target.value)}
                  >
                    {faturas.map((f) => (
                      <option key={f.competence} value={f.competence}>
                        {`${rotuloCompetencia(f.competence)} · ${formatBRL(f.amount_cents)}`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {fatura !== null ? (
                /*
                  ⚠️ O N vive no CONTEXTO do número, não numa linha perdida:
                  o dono está prestes a mexer em N lançamentos de uma vez, e o
                  valor sozinho não diz isso. `escala="heroi"` (30px, COM
                  centavos) porque o card ocupa a largura do painel e é o
                  valor exato que vai sair da conta.
                */
                <NumeroCard
                  rotulo={`Fatura de ${rotuloCompetencia(fatura.competence)}`}
                  valorCents={fatura.amount_cents}
                  escala="heroi"
                  data-testid="fatura-total"
                  contexto={
                    <span data-testid="fatura-linhas">
                      {fatura.line_count === 1
                        ? '1 lançamento será liquidado'
                        : `${fatura.line_count} lançamentos serão liquidados`}
                    </span>
                  }
                />
              ) : null}

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`fatura-origem-${cartao.id}`}>
                    Pagar com
                  </Label>
                  <Ajuda rotulo="De onde sai o dinheiro">
                    O valor sai desta conta e entra no cartão, como
                    transferência — por isso não conta como despesa nova (a
                    despesa já foi cada compra). O saldo ao lado do nome é o de
                    agora.
                  </Ajuda>
                </div>
                <select
                  id={`fatura-origem-${cartao.id}`}
                  className={SELECT_CLASSNAME}
                  data-testid="fatura-origem"
                  value={origemId}
                  onChange={(e) => setOrigemId(e.target.value)}
                >
                  <option value="">Escolha a conta…</option>
                  {origens.map((c) => (
                    <option key={c.id} value={c.id}>
                      {rotuloConta(c)}
                    </option>
                  ))}
                </select>
                {saldoNaoCobre ? (
                  <p
                    className="text-destructive text-sm"
                    data-testid="saldo-nao-cobre"
                  >
                    O saldo de &quot;{origem?.name}&quot; (
                    {formatBRL(origem?.balance_cents ?? 0)}) não cobre esta
                    fatura. Dá pra pagar assim mesmo — a conta fica negativa.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`fatura-data-${cartao.id}`}>
                  Data do pagamento
                </Label>
                <Input
                  id={`fatura-data-${cartao.id}`}
                  type="date"
                  data-testid="fatura-data"
                  value={pagoEm}
                  onChange={(e) => setPagoEm(e.target.value)}
                />
                <p className={cn(ROTULO, 'normal-case')}>
                  É a data que entra no fluxo de caixa.
                </p>
              </div>
            </div>
          ) : null}

          {erro !== null ? (
            <p
              role="alert"
              className="text-destructive text-sm"
              data-testid="fatura-erro"
              /*
                ⚠️ `block: 'nearest'` — a lição já paga duas vezes em
                `#/extrato` e reconfirmada em `transferir.tsx`: uma recusa
                renderizada fora do viewport não existe pro dono, que lê
                "toquei e nada aconteceu". Aqui o alerta nasce no fim de um
                painel rolável (`max-h-[85vh] overflow-y-auto`). `'nearest'`
                rola o MÍNIMO e é no-op quando já está visível.

                ⚠️ MEDIDO em Chrome real a 390×844, com a recusa de fato na
                tela: alerta em `top: 659,6 / bottom: 759,6`, tab bar fixa
                começando em `y=787` — ele termina **27,4 px ACIMA** dela, e
                `elementFromPoint` no topo E no fundo do alerta devolve o
                próprio alerta (nada por cima).

                ⚠️ E o que protege NÃO é o `scroll-padding-bottom` do `html`
                (a suposição de partida): quem rola aqui é o `SheetContent`,
                que é o próprio container de rolagem — o padding do `html` não
                governa esta rolagem. Quem protege é o EMPILHAMENTO: o painel
                é `z-50` e a tab bar `z-40` (medido), então a barra fica ATRÁS
                do painel enquanto ele está aberto. Não afrouxar nenhum dos
                dois achando que o outro cobre.
              */
              ref={(el) => {
                el?.scrollIntoView({ block: 'nearest' })
              }}
            >
              {erro}
            </p>
          ) : null}

          <SheetFooter className="gap-2">
            <Button
              type="button"
              className={ALVO_LINHA}
              data-testid="revisar-pagamento"
              disabled={fatura === null || enviando || pago}
              onClick={revisar}
            >
              {enviando ? 'Pagando…' : 'Pagar fatura'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/*
        ⚠️ `Dialog` do design system, NUNCA `window.confirm()` — decisão já
        registrada com evidência em `debt-detail.tsx`/`recorrentes.tsx`/
        `accounts.tsx`: o Chrome Android passa a devolver `false` EM SILÊNCIO
        depois que o usuário marca "impedir caixas de diálogo adicionais", e o
        botão vira inerte até um F5. Numa operação que move dinheiro e liquida
        N linhas, "não fez nada" seria o melhor dos casos.

        Fica FORA do `SheetContent` (irmão, não filho): os dois portam pro
        `body` e o diálogo empilha por cima do painel, que continua aberto
        atrás — o dono não perde o contexto do que conferiu.
      */}
      {/*
        ⚠️ Com o envio em voo, o diálogo NÃO se deixa fechar (nem por `Esc`,
        nem por toque fora): quem o fecha é o fim da operação, e só ele sabe se
        deu certo. Fechá-lo no meio devolveria o dono a uma tela muda enquanto
        o dinheiro está sendo movido.
      */}
      <Dialog
        open={confirmando}
        onOpenChange={(aberto) => {
          if (!enviando) setConfirmando(aberto)
        }}
      >
        <DialogContent data-testid="confirmar-pagamento">
          <DialogHeader>
            <DialogTitle>
              Pagar a fatura de{' '}
              {fatura !== null ? rotuloCompetencia(fatura.competence) : ''}?
            </DialogTitle>
            {/*
              ⚠️ O texto diz o que a operação FAZ — as duas metades, porque só
              uma delas seria uma mentira por omissão: liquida N lançamentos E
              move o dinheiro. E diz o que não existe: desfazer em lote.
            */}
            <DialogDescription>
              {fatura !== null && origem !== null
                ? `Isto liquida ${fatura.line_count} ${
                    fatura.line_count === 1 ? 'lançamento' : 'lançamentos'
                  } da fatura de ${rotuloCompetencia(fatura.competence)} e move ${formatBRL(
                    fatura.amount_cents,
                  )} de "${origem.name}" para "${cartao.name}", com data de ${pagoEm}. Não há como desfazer em lote: seria preciso apagar a transferência e reabrir cada lançamento, um por um.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className={ALVO_LINHA}
                data-testid="cancelar-pagamento"
                disabled={enviando}
              >
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              className={ALVO_LINHA}
              data-testid="confirmar-pagamento-botao"
              disabled={enviando}
              onClick={pagar}
            >
              {enviando ? 'Pagando…' : 'Pagar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
