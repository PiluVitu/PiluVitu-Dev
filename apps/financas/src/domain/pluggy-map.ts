/**
 * Adaptador Pluggy → `LinhaImportada` — o arquivo PERIGOSO da fatia.
 *
 * `src/lib/pluggy.ts` entrega a transação **verbatim**, de propósito (ver as
 * duas armadilhas marcadas em `PluggyTransacao`). É AQUI que ela vira o que
 * `src/domain/import.ts` já sabe gravar — e um erro aqui corrompe 12 meses de
 * histórico de um jeito que `uq_tx_imported` impede de reimportar por cima: o
 * desfazer seria `DELETE ... WHERE import_source='pluggy'` ou Time Travel (que
 * restaura o banco INTEIRO).
 *
 * ⚠️ **NADA aqui toca o D1, HTTP ou relógio global.** É função pura sobre um
 * objeto — testável valor a valor, que é a única forma de provar uma conversão
 * de dinheiro.
 *
 * ⚠️ **Linha rejeitada é REPORTADA, nunca descartada em silêncio** — mesmo
 * contrato de `scripts/pdf-import.mjs#validateLine` (que nunca lança e devolve
 * `{ok:false, motivo}`), e pelo mesmo motivo: "sumiu" e "não importei porque X"
 * são coisas diferentes para quem confere, e a segunda é a única acionável.
 */
import type { LinhaImportada } from '@piluvitu/tools/import'
import { isRealCalendarDate, todayInTeresina } from '../lib/dates'
import type { PluggyTransacao } from '../lib/pluggy'

/**
 * ④ **O ÚNICO `status` que vira lançamento — e a fonte é a doc, citada.**
 *
 * > `"POSTED"`: the transaction is confirmed/settled at the institution.
 * > `"PENDING"`: the transaction is authorized but not yet settled.
 * > — https://docs.pluggy.ai/reference/transactions-retrieve
 *
 * ⚠️⚠️ **CONSEQUÊNCIA MEDIDA NA DOC QUE O BRIEF NÃO PREVIA, e ela é grande:
 * num CARTÃO DE CRÉDITO, `PENDING` não é "transação instável de hoje" — é
 * A FATURA ABERTA INTEIRA.**
 *
 * > "For transactions that are available in "Open" invoices or are future
 * > installments, the `status` will return them as `PENDING`, since the
 * > transaction has not yet impacted the due balance."
 * > — https://docs.pluggy.ai/docs/transactions
 *
 * > "PENDING: a transaction belongs to an invoice that is still open, and does
 * > not have a billId. POSTED: a transaction belongs to an invoice that has
 * > already matured (...). All transactions will be updated to posted (...)
 * > once the bill is closed."
 * > — https://docs.pluggy.ai/docs/credit-card-installments
 *
 * Ou seja: importar só `POSTED` significa que **a fatura do mês corrente não
 * entra pelo Pluggy até fechar** — e é exatamente ela que alimenta
 * `commitments()` (que soma parcela prevista, `settled_at IS NULL` +
 * `bill_competence IS NOT NULL`), a tela que este módulo existe pra encher.
 *
 * **Decisão: manter só `POSTED`, e tornar a exclusão VISÍVEL e CONTÁVEL em vez
 * de silenciosa.** Os dois motivos, nesta ordem:
 *
 * 1. **Uma linha `PENDING` ainda muda de valor** (pré-autorização de posto,
 *    gorjeta, conversão de moeda que só liquida depois). Gravá-la fixa um
 *    número errado que `uq_tx_imported` impede de corrigir por reimportação.
 * 2. **É justamente enquanto está `PENDING` que o id do Pluggy troca** (ver
 *    ⑤ abaixo: o id é recriado quando data/descrição/valor mudam demais).
 *    Importar `PENDING` é importar exatamente as linhas cujo `imported_id` tem
 *    mais chance de mudar depois — e aí a MESMA compra volta com id novo e
 *    entra uma SEGUNDA vez, sem nada capaz de perceber. Esperar o `POSTED`
 *    mata as duas armadilhas de uma vez.
 *
 * O que NÃO é aceitável é o dono achar que sincronizou o mês e não ver a
 * fatura aberta: `mapearTransacoes` devolve cada pendente em `rejeitadas` com
 * motivo, para a tela poder dizer "12 lançamentos ainda na fatura aberta não
 * foram importados" em vez de mostrar um sucesso mudo. O caminho da fatura
 * aberta continua sendo o import de OFX/CSV/PDF, que já existe.
 */
export const STATUS_IMPORTAVEL = 'POSTED'

/**
 * ① Os dois valores de `type`. Ver `sinalDe()` abaixo para por que ELE, e não
 * o sinal de `amount`, é a fonte da verdade.
 */
export const TIPO_SAIDA = 'DEBIT'
export const TIPO_ENTRADA = 'CREDIT'

/** Única moeda que `importTransactions` sabe gravar. Ver `mapearTransacao`. */
export const MOEDA_SUPORTADA = 'BRL'

export type Mapeamento =
  | { ok: true; linha: LinhaImportada }
  | { ok: false; motivo: string }

export type LinhaRejeitada = {
  /** Posição na página recebida — o que permite apontar a linha na conferência. */
  index: number
  /** `id` do Pluggy, quando havia um. */
  id: string
  motivo: string
}

export type ResultadoMapeamento = {
  linhas: LinhaImportada[]
  rejeitadas: LinhaRejeitada[]
}

/**
 * ① **SINAL — `type` é a fonte da verdade, `amount` só dá a MAGNITUDE.**
 *
 * ⚠️⚠️ **O sinal de `amount` NÃO tem significado único: ele depende do TIPO DA
 * CONTA.** É por isso que "inverter o sinal" (a leitura óbvia da frase
 * *"positive amounts indicate debits"*) seria tão errado quanto não inverter —
 * só que corrompendo a outra metade das contas.
 *
 * | Conta         | Doc                                                                       |
 * | ------------- | ------------------------------------------------------------------------- |
 * | Cartão        | "Positive amounts (+X) indicate debits (...) Negative amounts (–X) indicate credits/payments" |
 * | Conta corrente | negativo = despesa, positivo = entrada (o MESMO deste schema)             |
 *
 * — https://docs.pluggy.ai/docs/transactions
 *
 * Uma regra de sinal global aplicada aos dois tipos erra em UM deles por
 * construção, e o erro é de **2×** em `accountBalances()` mais o sumiço da
 * despesa em `byCategory()` (que filtra `amount_cents < 0`). O `CHECK
 * (amount_cents <> 0)` (`0001:145`) aceita qualquer sinal — o banco não tem
 * como reclamar.
 *
 * **`type` não tem essa ambiguidade — ele é definido pelo FLUXO, não pela
 * contabilidade da conta:**
 *
 * > `"CREDIT"`: money entered the account (deposits, incoming transfers,
 * > refunds). `"DEBIT"`: money left the account (payments, withdrawals,
 * > outgoing transfers, credit-card purchases).
 * > — https://docs.pluggy.ai/reference/transactions-retrieve
 *
 * Isso mapeia **igual nos dois tipos de conta**, que é a propriedade inteira:
 * compra no cartão é `DEBIT` (sai dinheiro meu) → negativo aqui; estorno é
 * `CREDIT` → positivo; despesa na conta corrente é `DEBIT` → negativo; salário
 * é `CREDIT` → positivo. Uma regra, os dois tipos de conta, sem precisar saber
 * qual é qual.
 *
 * ⚠️ **Quando os dois DISCORDAM, `type` vence e não há aviso — porque não há
 * discordância a detectar.** "Discordar" pressuporia que o sinal de `amount`
 * afirma uma direção, e a tabela acima mostra que ele não afirma: num cartão,
 * `DEBIT` com `amount` positivo é o caso NORMAL, não um conflito. Tratar isso
 * como suspeita marcaria toda compra de cartão como problema.
 *
 * ⚠️ **`type` ausente ou desconhecido REJEITA a linha, nunca chuta pelo sinal.**
 * Cair no sinal como plano B é reintroduzir a ambiguidade por baixo, e o palpite
 * erraria justamente onde ninguém está olhando. `type` é campo documentado do
 * objeto Transaction; sem ele, a direção é desconhecida — e "não sei" grava
 * `rejeitadas`, não uma linha.
 */
function sinalDe(tipo: string | undefined): -1 | 1 | null {
  if (tipo === TIPO_SAIDA) return -1
  if (tipo === TIPO_ENTRADA) return 1
  return null
}

/**
 * ② **FLOAT → INTEIRO.** `amount` vem como float do JSON; `amount_cents` é
 * `INTEGER`. `Math.round(x * 100)` é o único ponto de conversão.
 *
 * ⚠️ Recebe a **magnitude** (`Math.abs`) — o sinal já foi decidido por
 * `sinalDe()` e é aplicado depois. Arredondar antes de tirar o sinal evitaria
 * a assimetria de `Math.round` em negativos (`Math.round(-0.5) === -0` mas
 * `Math.round(0.5) === 1`), que faria meio centavo cair para lados diferentes
 * conforme a direção do lançamento.
 *
 * **Casos medidos (`node -e`), não deduzidos:**
 *
 * | Entrada     | `x * 100`            | `Math.round` |
 * | ----------- | -------------------- | ------------ |
 * | `0.1 + 0.2` | `30.000000000000004` | `30` ✔       |
 * | `19.99`     | `1998.9999999999998` | `1999` ✔     |
 * | `8.615`     | `861.4999999999999`  | `862` ✔      |
 * | `1.005`     | `100.49999999999999` | `100` ⚠      |
 *
 * ⚠️ **A última linha é honesta, não um bug escondido:** `1.005` sai `R$ 1,00`,
 * não `R$ 1,01`, porque `1.005` não é representável em IEEE754 e o valor real
 * armazenado é levemente MENOR. Isso só alcança entrada com **3 casas
 * decimais**, que em BRL não é dinheiro — é ruído. Fica documentado e coberto
 * por teste com o valor exato em vez de "corrigido" com `toFixed`, que só
 * mudaria de qual lado o meio centavo cai sem tornar a entrada mais válida.
 */
function centavosDe(magnitude: number): number | null {
  if (!Number.isFinite(magnitude)) return null
  const cents = Math.round(magnitude * 100)
  // Guarda de sanidade: acima de 2^53 o próprio arredondamento deixa de ser
  // confiável, e nenhum valor real de uma conta pessoal chega perto.
  if (!Number.isSafeInteger(cents)) return null
  return cents
}

/**
 * ③ **DATA UTC → DIA LOCAL DE TERESINA (GMT-3).**
 *
 * ⚠️ Esta é a **5ª vez** que este projeto encara a mesma classe de bug, e por
 * isso a técnica é **reusada, não reinventada**: byte a byte o precedente de
 * `src/domain/cashflow.ts#localCompetence` — `todayInTeresina(new Date(x))`
 * (que já é a aritmética de deslocamento de `lib/dates.ts`), **guardado por
 * `includes('T')`**.
 *
 * ⚠️ **A guarda de `'T'` é obrigatória e o motivo é medido:**
 * `new Date('2026-08-15')` (data sem hora) é parseada como **meia-noite UTC**
 * (`2026-08-15T00:00:00.000Z`, verificado), e subtrair 3 h dela empurra o dia
 * pra **TRÁS** — o mesmo bug na direção oposta, batendo justo no dia 1 de cada
 * mês. Data sem hora já é local: passa direto.
 *
 * O efeito que justifica tudo isto: `purchase_date` alimenta
 * `billCompetence(purchase_date, closing_day)` em `importTransactions`, e
 * `bill_competence` é **derivado e NÃO patchável** (`PATCH
 * /api/transactions/:id` recusa com `protected_field`). Uma compra às 23h30
 * UTC do dia 15 é do dia **15** em Teresina (20h30) — cortar o `slice(0, 10)`
 * cru gravaria dia 15 também, mas às 01h00 UTC do dia 16 (22h do dia 15 local)
 * gravaria **16**, e num cartão que fecha dia 15 isso joga a compra pra uma
 * fatura inteira à frente, sem correção possível pela interface.
 */
function diaLocalDe(date: string): string | null {
  if (typeof date !== 'string' || date.trim() === '') return null

  // Sem hora ⇒ já é uma data local; converter a empurraria pro dia anterior.
  const dia = date.includes('T')
    ? todayInTeresina(new Date(date))
    : date.slice(0, 10)

  return isRealCalendarDate(dia) ? dia : null
}

/**
 * Converte UMA transação. Nunca lança: devolve `{ok:false, motivo}` para a
 * linha ser reportada.
 *
 * ⑤ **`imported_id` = o UUID do Pluggy — com uma ressalva que a doc dá por
 * escrito e que NÃO pode ficar implícita:**
 *
 * > **Transaction Id can change** — "When Pluggy syncs transactions with the
 * > Financial Institution, we create a hash related to the transaction, that
 * > allows us to maintain the transaction's id between synchronization. In case
 * > there are too many changes on the transaction's data such as Date,
 * > Description, or Amount, that can't allow us to confirm the transaction is
 * > the same as the one before. In those cases, we **will delete the existing
 * > transaction** and create a new one."
 * > — https://docs.pluggy.ai/docs/transactions
 *
 * Ou seja: **a doc NÃO garante estabilidade**, e o modo de falha é exatamente
 * o que a dedupe existe pra impedir — a mesma compra volta com id novo,
 * `(account_id, imported_id)` não casa com nada, e ela entra uma segunda vez.
 * Dito em vez de assumido, como o brief pediu.
 *
 * O que reduz o risco a quase nada **não é uma segunda chave** — é o filtro de
 * `POSTED` (④): o id só é recriado quando data/descrição/valor mudam demais, e
 * isso é o que acontece enquanto a linha está `PENDING`. Depois de liquidada,
 * os três campos param de mudar. As duas decisões se sustentam uma na outra.
 *
 * ⚠️ **Não se usa `idEstavel` (o hash de `packages/tools`) aqui**: ele colide
 * de propósito para duas compras idênticas no mesmo dia (dois cafés de R$ 8) —
 * trocaria um risco raro por uma perda de linha garantida.
 */
export function mapearTransacao(tx: PluggyTransacao): Mapeamento {
  const id = typeof tx.id === 'string' ? tx.id.trim() : ''
  if (id === '') {
    return { ok: false, motivo: 'transação sem id — nada com que deduplicar' }
  }

  // ④ Status ANTES de qualquer conversão: uma pendente não é uma linha ruim,
  // é uma linha que ainda não é hora de gravar.
  if (tx.status !== STATUS_IMPORTAVEL) {
    const status = typeof tx.status === 'string' ? tx.status : 'ausente'
    return {
      ok: false,
      motivo:
        `status ${status} — só ${STATUS_IMPORTAVEL} é importado. ` +
        'Num cartão isso é a fatura ainda aberta: ela entra aqui quando fechar ' +
        '(ou agora, pelo import de OFX/CSV/PDF).',
    }
  }

  // Moeda: `LinhaImportada` não carrega moeda e `importTransactions` grava
  // 'BRL' fixo. Uma compra em USD viraria o valor em dólar rotulado como real
  // — e `amount_original_cents`/`fx_rate_ppm` (as colunas que existem
  // exatamente pra isso) ficariam nulas, sem nada denunciando.
  const moeda = tx.currencyCode ?? MOEDA_SUPORTADA
  if (moeda !== MOEDA_SUPORTADA) {
    return {
      ok: false,
      motivo: `moeda ${moeda} — só ${MOEDA_SUPORTADA} é suportada no import (lance à mão para registrar a conversão)`,
    }
  }

  // ① Direção pelo `type`, nunca pelo sinal de `amount`.
  const sinal = sinalDe(tx.type)
  if (sinal === null) {
    return {
      ok: false,
      motivo: `type ${tx.type ?? 'ausente'} — sem ${TIPO_SAIDA}/${TIPO_ENTRADA} não dá para saber a direção, e o sinal de amount depende do tipo da conta`,
    }
  }

  // ② Magnitude primeiro, sinal depois.
  if (typeof tx.amount !== 'number') {
    return { ok: false, motivo: 'amount ausente ou não numérico' }
  }
  const magnitude = centavosDe(Math.abs(tx.amount))
  if (magnitude === null) {
    return { ok: false, motivo: `amount fora de faixa: ${String(tx.amount)}` }
  }
  if (magnitude === 0) {
    // `CHECK (amount_cents <> 0)` recusaria no INSERT — e como o batch é
    // atômico, derrubaria as outras linhas do lote junto.
    return { ok: false, motivo: 'amount zero — o schema não aceita' }
  }

  // ③ Data.
  const purchase_date = diaLocalDe(tx.date)
  if (purchase_date === null) {
    return { ok: false, motivo: `date inválida: ${String(tx.date)}` }
  }

  const description = (tx.description ?? '').trim()
  if (description === '') {
    return { ok: false, motivo: 'description vazia' }
  }

  return {
    ok: true,
    linha: {
      imported_id: id,
      purchase_date,
      amount_cents: sinal * magnitude,
      description,
    },
  }
}

/**
 * Converte uma página inteira, separando o que entra do que foi recusado.
 *
 * ⑥ **MAPEAMENTO CAMPO A CAMPO — o que o Pluggy manda × o que `transactions`
 * precisa.** O que não tem correspondente fica **nulo de propósito**, e as
 * `rules` (`packages/tools/src/regras.ts`, já rodando no import) resolvem
 * depois — nada aqui infere favorecido ou categoria, mesma regra do §7 do spec
 * de import ("payee é sugestão confirmável, nunca gravação automática").
 *
 * | `transactions`          | Vem de                | Observação                                           |
 * | ----------------------- | --------------------- | ---------------------------------------------------- |
 * | `imported_id`           | `id`                  | ⑤ estabilidade NÃO garantida pela doc                |
 * | `amount_cents`          | `type` + `amount`     | ① sinal do `type`, magnitude do `amount`; ② ×100     |
 * | `purchase_date`         | `date`                | ③ UTC → dia local de Teresina                        |
 * | `description`           | `description`         | `descriptionRaw` fica de fora: é o texto sujo do banco, e a regra de categorização casa melhor com o limpo |
 * | `import_source`         | —                     | `'pluggy'`, posto por quem chama a rota              |
 * | `bill_competence`       | —                     | **derivado** por `importTransactions` via `billCompetence()` |
 * | `settled_at`            | —                     | sempre `NULL` no import (fatura em aberto é previsão) |
 * | `currency`              | `currencyCode`        | só `BRL` passa; o resto é recusado                   |
 * | `payee_id`              | **sem correspondente** | `merchant` do Pluggy não é o `payees.id` daqui; fica nulo → regras |
 * | `category_id`           | **sem correspondente** | `category` vem **sempre `null`** no plano free (medido) → regras |
 * | `is_business`           | **sem correspondente** | PJ/PF é decisão do dono, não existe no Pluggy → regras/checkbox |
 * | `amount_original_cents` / `fx_rate_ppm` | **sem correspondente** | por isso moeda ≠ BRL é recusada em vez de achatada |
 * | `transfer_id` / `parent_id` | **sem correspondente** | transferência e rateio são construções deste app     |
 */
export function mapearTransacoes(
  transacoes: PluggyTransacao[],
): ResultadoMapeamento {
  const linhas: LinhaImportada[] = []
  const rejeitadas: LinhaRejeitada[] = []

  transacoes.forEach((tx, index) => {
    const r = mapearTransacao(tx)
    if (r.ok) {
      linhas.push(r.linha)
      return
    }
    rejeitadas.push({
      index,
      id: typeof tx?.id === 'string' ? tx.id : '',
      motivo: r.motivo,
    })
  })

  return { linhas, rejeitadas }
}
