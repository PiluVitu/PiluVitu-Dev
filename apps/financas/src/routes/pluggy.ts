import { Hono } from 'hono'
import type { LinhaImportada } from '@piluvitu/tools/import'
import { mapearTransacoes, type LinhaRejeitada } from '../domain/pluggy-map'
import { isRealCalendarDate } from '../lib/dates'
import { errJson, okJson } from '../lib/envelope'
import {
  assertItemConectado,
  buscarItem,
  MSG_DESLIGADO,
  paginasDeTransacoes,
  PluggyCredencialInvalida,
  PluggyDesligado,
  PluggyInalcancavel,
  PluggyItemDesconectado,
  PluggyRateLimitado,
  PluggyRespostaIlegivel,
  PluggyTokenExpirado,
  pluggyConfigurado,
  type PluggyBindings,
} from '../lib/pluggy'

/**
 * Fatia ④ (Open Finance via Pluggy) — a PORTA HTTP do cliente
 * (`src/lib/pluggy.ts`) e do adaptador (`src/domain/pluggy-map.ts`), que
 * até aqui existiam testados e **inalcançáveis por qualquer requisição
 * real**.
 *
 * ⚠️ **Esta rota LÊ do Pluggy e não grava NADA.** Ela devolve as linhas já
 * mapeadas pro shape de `LinhaImportada` — as MESMAS que o parse de
 * OFX/CSV produz — e quem grava continua sendo `POST
 * /api/transactions/import` (`routes/import.ts`), depois de o dono
 * confirmar linha a linha na tela de conferência. **O Pluggy entra como
 * TERCEIRA ORIGEM do pipeline que já existe, nunca como um caminho
 * paralelo**: dedup por `imported_id`, sugestão por regra, checkbox por
 * linha e envio em lotes continuam sendo os mesmos, sem uma segunda cópia.
 *
 * ⚠️ **Não existe sincronização automática, e a ausência é o desenho.** Com
 * as duas armadilhas do sinal (① de `pluggy-map.ts`) e da data (②), a
 * conferência é a ÚNICA rede entre "importei" e "importei errado e não tem
 * volta" — `uq_tx_imported` impede reimportar por cima, então o desfazer
 * seria `DELETE ... WHERE import_source='pluggy'` ou Time Travel (que
 * restaura o banco INTEIRO). Um cron que gravasse sozinho tiraria a única
 * chance de olhar antes.
 *
 * ⚠️ **Fica atrás da SESSÃO, e isso é por AUSÊNCIA deliberada, não por um
 * guard local** — `src/index.ts` aplica `requireSession()` a `/api/*` e
 * abre exceção só pra `/api/health`, `/api/auth/*`, `POST /api/insights`
 * (path exato) e `GET /api/insights/numbers`. Esta rota **não entra em
 * nenhuma delas**, nem deve: o `INGEST_TOKEN` é do comando que roda no Mac
 * do dono, e quem toca "Sincronizar com o banco" é o dono no navegador.
 * Provado contra o app montado de verdade em `src/index.test.ts`.
 */

type Env = { Bindings: PluggyBindings }

export const pluggyRoutes = new Hono<Env>()

/**
 * Orçamento de subrequests, o número que amarra o desenho inteiro: o plano
 * free do Workers dá **50 por invocação**. Esta rota gasta, no pior caso,
 * `1` (`POST /auth`) + `1` (`GET /items/:id`) + `MAX_PAGINAS` (40) = **42**,
 * com 8 de folga. É por isso que a checagem do item cabe aqui sem apertar
 * nada — e por isso `paginasDeTransacoes` LANÇA ao estourar as 40 páginas
 * em vez de truncar em silêncio (ver `pluggy.ts`).
 */

export type PluggyTransactionsResponse = {
  account_id: string
  item_id: string
  from: string
  to: string
  /** Quantas páginas de 500 foram de fato buscadas (custo, em subrequests). */
  paginas: number
  /** Quantas transações o Pluggy devolveu — `linhas + rejeitadas`. */
  recebidas: number
  linhas: LinhaImportada[]
  rejeitadas: LinhaRejeitada[]
}

/**
 * Traduz cada classe de erro do cliente no par (status, code) próprio.
 *
 * ⚠️ **Uma classe por CAUSA porque cada uma manda o dono para um lugar
 * DIFERENTE** — achatar tudo num "não consegui sincronizar" faria o dono
 * corrigir um secret que está certo, ou esperar por um problema que nunca
 * passa sozinho. A `message` é **repassada crua do domínio**, nunca
 * reescrita aqui: é ela que diz "abra o app Meu Pluggy e reconecte" em vez
 * de "erro". As mensagens já são varridas contra vazamento de credencial
 * em `lib/pluggy.test.ts` (nenhuma é montada a partir da URL, do `init` ou
 * do erro cru).
 *
 * | Classe                     | HTTP | code                        |
 * | -------------------------- | ---- | --------------------------- |
 * | `PluggyDesligado`          | 503  | `pluggy_disabled`           |
 * | `PluggyCredencialInvalida` | 503  | `pluggy_invalid_credentials`|
 * | `PluggyItemDesconectado`   | 409  | `pluggy_item_disconnected`  |
 * | `PluggyRateLimitado`       | 429  | `pluggy_rate_limited`       |
 * | `PluggyInalcancavel`       | 503  | `pluggy_unreachable`        |
 * | `PluggyTokenExpirado`      | 502  | `pluggy_token_expired`      |
 * | `PluggyRespostaIlegivel`   | 502  | `pluggy_ilegivel`           |
 * | `RangeError` (teto de 40)  | 422  | `pluggy_janela_grande`      |
 *
 * ⚠️ **`409` no item desconectado, e não mais um `503`** — os três `503`
 * acima significam "indisponível, tente de novo mais tarde", e este é o
 * ÚNICO em que tentar de novo **nunca** resolve: alguma coisa precisa mudar
 * de estado antes (o dono reconectar no app Meu Pluggy). Dar o mesmo
 * número dos outros convidaria um retry automático futuro a bater nele
 * para sempre.
 *
 * ⚠️ **`502` (não `503`) em `token_expired`/`ilegivel`, pelo mesmo motivo
 * medido em `promeia.ts`: "ninguém respondeu" ≠ "alguém respondeu e eu não
 * entendi".** As duas mandam o dono para lados opostos — uma manda esperar,
 * a outra manda reportar/olhar o log —, e colapsá-las num número só é o
 * próprio bug que a separação de classes existe pra impedir.
 */
function traduzirFalhaPluggy(err: unknown): Response {
  if (err instanceof PluggyDesligado) {
    return errJson(503, 'pluggy_disabled', err.message)
  }
  if (err instanceof PluggyCredencialInvalida) {
    return errJson(503, 'pluggy_invalid_credentials', err.message)
  }
  if (err instanceof PluggyItemDesconectado) {
    return errJson(409, 'pluggy_item_disconnected', err.message)
  }
  if (err instanceof PluggyRateLimitado) {
    return errJson(429, 'pluggy_rate_limited', err.message)
  }
  if (err instanceof PluggyInalcancavel) {
    return errJson(503, 'pluggy_unreachable', err.message)
  }
  if (err instanceof PluggyTokenExpirado) {
    return errJson(502, 'pluggy_token_expired', err.message)
  }
  if (err instanceof PluggyRespostaIlegivel) {
    return errJson(502, 'pluggy_ilegivel', err.message)
  }
  // Único `RangeError` alcançável aqui: o teto de MAX_PAGINAS de
  // `paginasDeTransacoes`. Os outros (`from`/`to` fora do calendário,
  // `accountId` vazio, `page` inválida) são impossíveis — a rota valida os
  // três ANTES de chamar o cliente, com a mesma `isRealCalendarDate`. Não é
  // query malformada (o intervalo é real, só cabe demais nele), então não
  // vira `400 invalid_query`: é conteúdo, 422, com a mensagem do cliente
  // dizendo o que fazer (pedir um intervalo menor).
  if (err instanceof RangeError) {
    return errJson(422, 'pluggy_janela_grande', err.message)
  }
  throw err
}

pluggyRoutes.get('/transactions', async (c) => {
  // Desligado ≠ quebrado: sem os dois secrets a feature simplesmente não
  // existe neste ambiente. Roda ANTES de qualquer validação de parâmetro
  // (e antes de qualquer `fetch`) porque "não configurei o Pluggy" é uma
  // resposta mais útil que "seu from está errado" pra quem nunca ligou
  // nada. Mesmo padrão de `promeia_disabled` em `routes/insights.ts`.
  if (pluggyConfigurado(c.env) === null) {
    return errJson(503, 'pluggy_disabled', MSG_DESLIGADO)
  }

  const accountId = (c.req.query('account_id') ?? '').trim()
  const itemId = (c.req.query('item_id') ?? '').trim()
  const from = (c.req.query('from') ?? '').trim()
  const to = (c.req.query('to') ?? '').trim()

  // Query string malformada é SEMPRE `400 invalid_query` neste módulo
  // (regra de `reports.ts`/`reserve.ts`/`debts.ts`). A exceção histórica de
  // `routes/transactions.ts` (que usa 422) não se estende a rota nova.
  if (accountId === '') {
    return errJson(
      400,
      'invalid_query',
      'account_id é obrigatório — é o id da conta NO PLUGGY, não o id da conta deste app',
    )
  }

  // ⚠️ `item_id` é OBRIGATÓRIO, e a exigência é a diferença entre a
  // mensagem certa e a pior de todas. Sem ele não há como chamar
  // `GET /items/:id`, e um item desconectado devolveria `200` com uma
  // janela vazia: "sincronizei e não veio nada", sem nada dizendo que a
  // conexão com o banco caiu — exatamente o erro que mais aparece com o
  // tempo e o que mais parece genérico quando mal escrito. No Pluggy toda
  // conta pertence a um item, então pedir o par não inventa conceito
  // nenhum: é a mesma "conta", dita inteira.
  if (itemId === '') {
    return errJson(
      400,
      'invalid_query',
      'item_id é obrigatório — sem ele uma conexão caída devolveria uma janela vazia em vez de "reconecte no app Meu Pluggy"',
    )
  }

  // ⚠️ **Não existe janela DEFAULT, e a ausência é a guarda.** Um default
  // qualquer aqui seria, na prática, o tamanho do primeiro import de 12
  // meses de alguém — e é justamente o primeiro que não tem desfazer
  // barato. Sem `from`/`to` explícitos, nenhum caminho deste Worker
  // consegue pedir "tudo". Quem escolhe a janela (curta, por padrão) é a
  // tela; ver `web/src/lib/pluggy-ui.ts#janelaPadrao`.
  //
  // Validação de CALENDÁRIO (`isRealCalendarDate`, `lib/dates.ts`), nunca
  // regex de formato: `2026-02-30` passa em regex e sairia como um filtro
  // mudo lá no Pluggy.
  if (!isRealCalendarDate(from)) {
    return errJson(
      400,
      'invalid_query',
      `from inválido: "${from}" — esperado uma data real no formato YYYY-MM-DD`,
    )
  }
  if (!isRealCalendarDate(to)) {
    return errJson(
      400,
      'invalid_query',
      `to inválido: "${to}" — esperado uma data real no formato YYYY-MM-DD`,
    )
  }
  // Comparação lexicográfica basta: `YYYY-MM-DD` ordena igual a
  // cronologicamente (a mesma garantia que sustenta os índices do módulo).
  if (from > to) {
    return errJson(
      400,
      'invalid_query',
      `intervalo invertido: from (${from}) é depois de to (${to})`,
    )
  }

  try {
    // A checagem do item vem ANTES de gastar página: 1 subrequest pra não
    // pagar 40 e concluir "o Pluggy não trouxe nada". `buscarItem` devolve
    // o fato e `assertItemConectado` aplica a política — separados de
    // propósito no cliente (mesmo precedente de `assertEmailPermitido`).
    assertItemConectado(await buscarItem(c.env, itemId))

    const linhas: LinhaImportada[] = []
    const rejeitadas: LinhaRejeitada[] = []
    let paginas = 0
    let recebidas = 0

    for await (const pagina of paginasDeTransacoes(c.env, {
      accountId,
      from,
      to,
    })) {
      const resultado = mapearTransacoes(pagina)
      linhas.push(...resultado.linhas)
      // ⚠️ `index` de `mapearTransacoes` é a posição DENTRO da página. Sem
      // somar o que já veio, a página 2 recomeçaria do 0 e a tela apontaria
      // "linha 3" para duas linhas diferentes — um número que parece
      // preciso e não localiza nada. O deslocamento é o total recebido
      // ANTES desta página.
      for (const rejeitada of resultado.rejeitadas) {
        rejeitadas.push({ ...rejeitada, index: rejeitada.index + recebidas })
      }
      paginas += 1
      recebidas += pagina.length
    }

    return okJson<PluggyTransactionsResponse>({
      account_id: accountId,
      item_id: itemId,
      from,
      to,
      paginas,
      recebidas,
      linhas,
      rejeitadas,
    })
  } catch (err) {
    return traduzirFalhaPluggy(err)
  }
})
